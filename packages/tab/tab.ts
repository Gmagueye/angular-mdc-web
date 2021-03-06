import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Directive,
  ElementRef,
  EventEmitter,
  Inject,
  InjectionToken,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Optional,
  Output,
  ViewChild,
  ViewEncapsulation
} from '@angular/core';
import { fromEvent, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { toBoolean } from '@angular-mdc/web/common';
import { MdcRipple } from '@angular-mdc/web/ripple';
import { MdcTabIndicator } from '@angular-mdc/web/tab-indicator';

import { MDCTabAdapter } from '@material/tab/adapter';
import { MDCTabFoundation } from '@material/tab';

/**
 * Describes a parent MdcTabBar component.
 * Contains properties that MdcTab can inherit.
 */
export interface MdcTabBarParentComponent {
  activateTab(index: number): void;
  getTabIndex(tab: MdcTab): number;
}

/**
 * Injection token used to provide the parent MdcTabBar component to MdcTab.
 */
export const MDC_TAB_BAR_PARENT_COMPONENT =
  new InjectionToken<MdcTabBarParentComponent>('MDC_TAB_BAR_PARENT_COMPONENT');

export interface MdcTabInteractedEvent {
  detail: {
    tab: MdcTab;
  };
}

@Directive({
  selector: 'mdc-tab-label, [mdcTabLabel]',
  host: {
    'class': 'mdc-tab__text-label'
  }
})
export class MdcTabLabel {
  constructor(public elementRef: ElementRef) { }
}

@Directive({
  selector: 'mdc-tab-icon, [mdcTabIcon]',
  host: {
    'class': 'mdc-tab__icon'
  }
})
export class MdcTabIcon {
  constructor(public elementRef: ElementRef) { }
}

@Component({
  moduleId: module.id,
  selector: '[mdcTab], mdc-tab',
  exportAs: 'mdcTab',
  host: {
    'role': 'tab',
    'class': 'mdc-tab',
    '[class.mdc-tab--active]': 'active',
    '[class.mdc-tab--stacked]': 'stacked',
    '[class.mdc-tab--min-width]': 'fixed'
  },
  template: `
  <div #content class="mdc-tab__content">
    <mdc-icon class="mdc-tab__icon" *ngIf="icon">{{icon}}</mdc-icon>
    <ng-content select="mdc-icon"></ng-content>
    <span class="mdc-tab__text-label" *ngIf="label">{{label}}</span>
    <ng-content></ng-content>
    <ng-container *ngIf="fixed">
      <ng-container *ngTemplateOutlet="indicator"></ng-container>
    </ng-container>
  </div>
  <ng-container *ngIf="!fixed">
    <ng-container *ngTemplateOutlet="indicator"></ng-container>
  </ng-container>
  <ng-template #indicator><mdc-tab-indicator></mdc-tab-indicator></ng-template>
  <div #ripplesurface class="mdc-tab__ripple"></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [MdcRipple]
})
export class MdcTab implements OnInit, OnDestroy {
  /** Emits whenever the component is destroyed. */
  private _destroy = new Subject<void>();

  @Input() label: string;
  @Input() icon: string;

  @Input()
  get stacked(): boolean { return this._stacked; }
  set stacked(value: boolean) {
    this._stacked = toBoolean(value);
  }
  private _stacked: boolean;

  @Input()
  get fixed(): boolean { return this._fixed; }
  set fixed(value: boolean) {
    this._fixed = toBoolean(value);
    this._changeDetectorRef.detectChanges();
  }
  private _fixed: boolean;

  @Output() readonly interacted: EventEmitter<MdcTabInteractedEvent> =
    new EventEmitter<MdcTabInteractedEvent>();

  @ViewChild('content') content: ElementRef;
  @ViewChild('ripplesurface') rippleSurface: ElementRef;
  @ViewChild(MdcTabIndicator) tabIndicator: MdcTabIndicator;

  private _mdcAdapter: MDCTabAdapter = {
    setAttr: (attr: string, value: string) => this._getHostElement().setAttribute(attr, value),
    addClass: (className: string) => this._getHostElement().classList.add(className),
    removeClass: (className: string) => this._getHostElement().classList.remove(className),
    hasClass: (className: string) => this._getHostElement().classList.contains(className),
    activateIndicator: (previousIndicatorClientRect: ClientRect) => this.tabIndicator.activate(previousIndicatorClientRect),
    deactivateIndicator: () => this.tabIndicator.deactivate(),
    notifyInteracted: () => this.interacted.emit({ detail: { tab: this } }),
    getOffsetLeft: () => this._getHostElement().offsetLeft,
    getOffsetWidth: () => this._getHostElement().offsetWidth,
    getContentOffsetLeft: () => this.content.nativeElement.offsetLeft,
    getContentOffsetWidth: () => this.content.nativeElement.offsetWidth,
    focus: () => this._getHostElement().focus()
  };

  private _foundation: {
    init(): void,
    isActive(): boolean,
    activate(previousIndicatorClientRect: ClientRect): void,
    deactivate(): void,
    computeDimensions(): void,
    handleClick(): void
  } = new MDCTabFoundation(this._mdcAdapter);

  constructor(
    private _ngZone: NgZone,
    private _changeDetectorRef: ChangeDetectorRef,
    private _ripple: MdcRipple,
    public elementRef: ElementRef,
    @Optional() @Inject(MDC_TAB_BAR_PARENT_COMPONENT) private _parent: MdcTabBarParentComponent) { }

  ngOnInit(): void {
    this._foundation.init();
    this._ripple.attachTo(this.rippleSurface.nativeElement);

    this._ngZone.runOutsideAngular(() =>
      fromEvent<MouseEvent>(this._getHostElement(), 'click').pipe(takeUntil(this._destroy))
        .subscribe(() => this._ngZone.run(() => {
          if (!this.active) {
            this._foundation.handleClick();
          }
        })));
  }

  ngOnDestroy(): void {
    this._destroy.next();
    this._destroy.complete();

    this._ripple.destroy();
  }

  /** Getter for the active state of the tab */
  get active(): boolean {
    return this._foundation.isActive();
  }

  /** Activates the tab */
  activate(computeIndicatorClientRect: ClientRect): void {
    this._foundation.activate(computeIndicatorClientRect);
  }

  /** Deactivates the tab */
  deactivate(): void {
    this._foundation.deactivate();
  }

  /** Returns the indicator's client rect */
  computeIndicatorClientRect(): ClientRect {
    return this.tabIndicator.computeContentClientRect();
  }

  computeDimensions(): any {
    return this._foundation.computeDimensions();
  }

  getTabBarParent(): MdcTabBarParentComponent {
    return this._parent;
  }

  focus(): void {
    this._getHostElement().focus();
  }

  /** Retrieves the DOM element of the component host. */
  private _getHostElement(): HTMLElement {
    return this.elementRef.nativeElement;
  }
}
