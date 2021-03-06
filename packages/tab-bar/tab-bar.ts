import {
  AfterContentInit,
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ContentChildren,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  QueryList,
  ViewEncapsulation
} from '@angular/core';
import { fromEvent, merge, Observable, Subscription, Subject } from 'rxjs';
import { startWith, takeUntil } from 'rxjs/operators';

import { toBoolean, Platform } from '@angular-mdc/web/common';
import { MdcTabScroller, MdcTabScrollerAlignment } from '@angular-mdc/web/tab-scroller';
import { MdcTabIndicator } from '@angular-mdc/web/tab-indicator';
import { MdcTab, MdcTabInteractedEvent, MDC_TAB_BAR_PARENT_COMPONENT } from '@angular-mdc/web/tab';

import { MDCTabBarAdapter } from '@material/tab-bar/adapter';
import { MDCTabBarFoundation } from '@material/tab-bar';

export class MdcTabActivatedEvent {
  constructor(
    public source: MdcTabBar,
    public index: number,
    public tab: MdcTab) { }
}

@Component({
  moduleId: module.id,
  selector: '[mdcTabBar], mdc-tab-bar',
  exportAs: 'mdcTabBar',
  host: {
    'role': 'tablist',
    'class': 'mdc-tab-bar'
  },
  template: '<ng-content></ng-content>',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [{ provide: MDC_TAB_BAR_PARENT_COMPONENT, useExisting: MdcTabBar }]
})
export class MdcTabBar implements AfterContentInit, OnDestroy {
  /** Emits whenever the component is destroyed. */
  private _destroy = new Subject<void>();

  @Input()
  get fade(): boolean { return this._fade; }
  set fade(value: boolean) {
    this.setFade(value);
  }
  private _fade: boolean;

  @Input()
  get stacked(): boolean { return this._stacked; }
  set stacked(value: boolean) {
    this.setStacked(value);
  }
  private _stacked: boolean;

  @Input()
  get fixed(): boolean { return this._fixed; }
  set fixed(value: boolean) {
    this.setFixed(value);
  }
  private _fixed: boolean;

  @Input()
  get align(): MdcTabScrollerAlignment { return this._align; }
  set align(value: MdcTabScrollerAlignment) {
    this.setAlign(value);
  }
  private _align: MdcTabScrollerAlignment;

  @Input()
  get iconIndicator(): string { return this._iconIndicator; }
  set iconIndicator(value: string) {
    this.setIconIndicator(value);
  }
  private _iconIndicator: string;

  @Input()
  get useAutomaticActivation(): boolean { return this._useAutomaticActivation; }
  set useAutomaticActivation(value: boolean) {
    this._useAutomaticActivation = toBoolean(value);
    this._foundation.setUseAutomaticActivation(this._useAutomaticActivation);
  }
  private _useAutomaticActivation: boolean;

  @Input()
  get activeTabIndex(): number { return this._activeTabIndex; }
  set activeTabIndex(value: number) {
    if (this.activeTabIndex !== value) {
      this._activeTabIndex = value;
      this.activateTab(this.activeTabIndex);
    }
  }
  private _activeTabIndex: number = 0;

  @Output() readonly activated: EventEmitter<MdcTabActivatedEvent> =
    new EventEmitter<MdcTabActivatedEvent>();

  @ContentChild(MdcTabScroller) tabScroller: MdcTabScroller;
  @ContentChildren(MdcTab, { descendants: true }) tabs: QueryList<MdcTab>;

  /** Subscription to changes in tabs. */
  private _changeSubscription: Subscription;

  /** Subscription to interaction events in tabs. */
  private _tabInteractionSubscription: Subscription | null;

  /** Combined stream of all of the tab interaction events. */
  get tabInteractions(): Observable<MdcTabInteractedEvent> {
    return merge(...this.tabs.map(tab => tab.interacted));
  }

  private _mdcAdapter: MDCTabBarAdapter = {
    scrollTo: (scrollX: number) => this.tabScroller.scrollTo(scrollX),
    incrementScroll: (scrollXIncrement: number) => this.tabScroller.incrementScroll(scrollXIncrement),
    getScrollPosition: () => this.tabScroller.getScrollPosition(),
    getScrollContentWidth: () => this.tabScroller.getScrollContentWidth(),
    getOffsetWidth: () => this._getHostElement().offsetWidth,
    isRTL: () => this._platform.isBrowser ? window.getComputedStyle(this._getHostElement()).getPropertyValue('direction') === 'rtl' : false,
    setActiveTab: (index: number) => this.activateTab(index),
    activateTabAtIndex: (index: number, clientRect: ClientRect) => {
      if (this._indexIsInRange(index)) {
        this.tabs.toArray()[index].activate(clientRect);
      }
    },
    deactivateTabAtIndex: (index: number) => {
      if (this._indexIsInRange(index)) {
        this.tabs.toArray()[index].deactivate();
      }
    },
    focusTabAtIndex: (index: number) => this.tabs.toArray()[index].focus(),
    getTabIndicatorClientRectAtIndex: (previousActiveIndex: number) => {
      if (!this._indexIsInRange(previousActiveIndex)) {
        previousActiveIndex = this.activeTabIndex;
      }
      return this.tabs.toArray()[previousActiveIndex].computeIndicatorClientRect();
    },
    getTabDimensionsAtIndex: (index: number) => this.tabs.toArray()[index].computeDimensions(),
    getPreviousActiveTabIndex: () => this.tabs.toArray().findIndex((_) => _.active),
    getFocusedTabIndex: () =>
      this._platform.isBrowser ? this.tabs.toArray().findIndex(tab => tab.elementRef.nativeElement === document.activeElement) : -1,
    getIndexOfTab: (tabToFind: MdcTab) => this.tabs.toArray().indexOf(tabToFind),
    getTabListLength: () => this.tabs.length,
    notifyTabActivated: (index: number) => this.activated.emit({ source: this, index: index, tab: this.tabs.toArray()[index] })
  };

  private _foundation: {
    init(): void,
    activateTab(index: number): void,
    handleKeyDown(evt: KeyboardEvent): void,
    handleTabInteraction(evt: MdcTabInteractedEvent): void,
    scrollIntoView(index: number): void,
    setUseAutomaticActivation(useAutomaticActivation: boolean): void
  } = new MDCTabBarFoundation(this._mdcAdapter);

  constructor(
    private _ngZone: NgZone,
    private _platform: Platform,
    public elementRef: ElementRef) { }

  ngAfterContentInit(): void {
    this._foundation.init();

    // When the list changes, re-subscribe
    this._changeSubscription = this.tabs.changes.pipe(startWith(null)).subscribe(() => {
      Promise.resolve().then(() => {
        if (this.tabs.length > 0) {
          this.activateTab(this.activeTabIndex);
          this._resetTabs();
        }
      });
    });

    this._ngZone.runOutsideAngular(() =>
      fromEvent<KeyboardEvent>(this._getHostElement(), 'keydown').pipe(takeUntil(this._destroy))
        .subscribe(evt => this._ngZone.run(() => this._foundation.handleKeyDown(evt))));
  }

  ngOnDestroy(): void {
    this._destroy.next();
    this._destroy.complete();

    if (this._changeSubscription) {
      this._changeSubscription.unsubscribe();
    }

    this._dropSubscriptions();
  }

  private _resetTabs(): void {
    this._dropSubscriptions();
    this._listenToTabInteraction();
  }

  private _dropSubscriptions(): void {
    if (this._tabInteractionSubscription) {
      this._tabInteractionSubscription.unsubscribe();
      this._tabInteractionSubscription = null;
    }
  }

  /** Listens to interaction events on each tab. */
  private _listenToTabInteraction(): void {
    this._tabInteractionSubscription = this.tabInteractions.subscribe(event => {
      const previousTab = this.getActiveTab();
      if (previousTab) {
        previousTab.tabIndicator.active = false;
      }

      event.detail.tab.tabIndicator.active = true;
      this._foundation.handleTabInteraction(event);
    });
  }

  setFade(fade: boolean): void {
    this._fade = toBoolean(fade);

    Promise.resolve().then(() => {
      this.tabs.forEach(tab => {
        tab.tabIndicator.fade = this.fade;
      });
    });
  }

  setStacked(stacked: boolean): void {
    this._stacked = toBoolean(stacked);

    Promise.resolve().then(() => {
      this.tabs.forEach(tab => {
        tab.stacked = this.stacked;
      });
    });
  }

  setFixed(fixed: boolean): void {
    this._fixed = toBoolean(fixed);

    Promise.resolve().then(() => {
      this.tabs.forEach(tab => {
        tab.fixed = this.fixed;
      });
    });
  }

  setAlign(align: MdcTabScrollerAlignment): void {
    this._align = align || 'start';

    Promise.resolve().then(() => {
      this.tabScroller.align = this.align;
    });
  }

  setIconIndicator(iconIndicator: string): void {
    this._iconIndicator = iconIndicator;

    Promise.resolve().then(() => {
      this.tabs.forEach(tab => {
        tab.tabIndicator.icon = this.iconIndicator;
      });
    });
  }

  /** Activates the tab at the given index */
  activateTab(index: number): void {
    if (!this.tabs) { return; }

    this.activeTabIndex = index;
    this._foundation.activateTab(index);
  }

  /** Scrolls the tab at the given index into view */
  scrollIntoView(index: number): void {
    this._foundation.scrollIntoView(index);
  }

  getActiveTabIndex(): number {
    return this.tabs.toArray().findIndex((_) => _.active);
  }

  getActiveTab(): MdcTab | undefined {
    return this.tabs.toArray().find((_) => _.active);
  }

  /** Returns an index for given tab */
  getTabIndex(tab: MdcTab): number {
    return this.tabs.toArray().indexOf(tab);
  }

  private _indexIsInRange(index: number): boolean {
    return index >= 0 && index < this.tabs.length;
  }

  /** Retrieves the DOM element of the component host. */
  private _getHostElement(): HTMLElement {
    return this.elementRef.nativeElement;
  }
}
