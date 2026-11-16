// Copyright 2026 The Libernet Team
// SPDX-License-Identifier: Apache-2.0

class Handler {
  private static _nextId = 1;
  private static _handlers: { [id: number]: EventListener } = Object.create(null);

  static {
    (window as any).$__mvw_handlers = Handler._handlers;
  }

  public readonly id: number;

  public constructor(fn: EventListener) {
    this.id = Handler._nextId++;
    Handler._handlers[this.id] = fn;
  }

  public toString(): string {
    return `$__mvw_handlers[${this.id}].call(this,event) `;
  }

  public static destroy(id: number): void {
    delete Handler._handlers[id];
  }
}

export interface Props {
  [key: string]: any;
}

class Component {
  public readonly template: HTMLTemplateElement;

  public constructor(html: string, handlers?: Handler[]) {
    this.template = document.createElement('template');
    this.template.innerHTML = ('' + html).trim();
    const fragment = this.template.content;
    if (fragment.childNodes.length !== 1) {
      throw new Error('components must have exactly one top-level element');
    }
    const node = fragment.childNodes[0]!;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      throw new Error('components must be tag elements');
    }
    if (handlers && handlers.length > 0) {
      const element = node as Element;
      element.setAttribute('data-mvw-handlers', handlers.map(handler => handler.id).join(','));
    }
  }

  public toString(): string {
    return this.template.innerHTML;
  }
}

export type { Component };

export type TemplateFunction<P extends Props> = (props: P) => Component;

export type StatefulProps = Props & { key: string };

export type StatefulTemplateFunction<P extends StatefulProps, S extends Props> = (
  props: P & { self: StateFrame<P, S> },
  state: S,
) => Component;

export class StateFrame<P extends StatefulProps = StatefulProps, S extends Props = Props> {
  private static _nextId = 1;
  private static _stack: StateFrame<any, any>[] = [];

  public readonly id: number;
  private readonly _fn: StatefulTemplateFunction<P, S>;
  private readonly _props: P & { self: StateFrame<P, S> };
  private _state: Partial<S>;
  private _component: Component;

  private _previousChildren: { [key: string]: StateFrame<any, any> } = Object.create(null);
  private _children: { [key: string]: StateFrame<any, any> } = Object.create(null);

  public constructor(fn: StatefulTemplateFunction<P, S>, props: P, state: Partial<S> | null) {
    if (!props || typeof props['key'] !== 'string') {
      throw new Error('stateful components must have a string "key" property');
    }

    this.id = StateFrame._nextId++;
    this._fn = fn;
    this._props = { ...props, self: this };

    const stack = StateFrame._stack;
    const parent = stack.length > 0 ? stack[stack.length - 1]! : null;

    const key = props['key'];
    let currentState: Partial<S> = {};
    if (parent) {
      if (key in parent._children) {
        throw new Error(`duplicate component key ${JSON.stringify(key)}`);
      }
      if (key in parent._previousChildren) {
        const child = parent._previousChildren[key]! as StateFrame<P, S>;
        currentState = { ...child._state };
      }
      parent._children[key] = this;
    }

    this._state = { ...(state || ({} as Partial<S>)), ...currentState };
    this._component = this._render();
  }

  private _render(): Component {
    const previousChildren = this._children;
    this._previousChildren = previousChildren;
    this._children = Object.create(null);
    const stack = StateFrame._stack;
    stack.push(this);
    try {
      const component = this._fn(this._props, this._state as S);
      const fragment = component.template.content;
      const element = fragment.childNodes[0] as Element;
      if (element.hasAttribute('data-mvw-frame')) {
        throw new Error('the root element of a component cannot be another stateful component');
      }
      element.setAttribute('data-mvw-frame', '' + this.id);
      return component;
    } catch (error) {
      this._children = previousChildren;
      throw error;
    } finally {
      stack.pop();
      this._previousChildren = Object.create(null);
    }
  }

  public toString(): string {
    return this._component.toString();
  }

  private static _destroyHandlers(element: Element): void {
    const ids = element.getAttribute('data-mvw-handlers');
    if (ids) {
      for (const id of ids.split(',')) {
        Handler.destroy(parseInt(id, 10));
      }
    }
  }

  public update(state: Partial<S>): StateFrame<P, S> {
    const oldElement = document.querySelector(`[data-mvw-frame="${this.id}"]`);
    if (!oldElement) {
      console.error(`element ${this.id} not found`);
    }
    const oldState = this._state;
    this._state = { ...oldState, ...state };
    let component: Component;
    try {
      component = this._render();
    } catch (error) {
      this._state = oldState;
      throw error;
    }
    this._component = component;
    if (oldElement) {
      const children = oldElement.querySelectorAll('[data-mvw-handlers]');
      for (let i = 0; i < children.length; i++) {
        StateFrame._destroyHandlers(children[i]!);
      }
      StateFrame._destroyHandlers(oldElement);
      const newElement = component.template.content.childNodes[0] as Element;
      oldElement.parentNode!.replaceChild(newElement, oldElement);
    }
    return this;
  }

  public updateSoon(state: Partial<S>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      window.setTimeout(() => {
        try {
          this.update(state);
        } catch (e) {
          reject(e);
          return;
        }
        resolve();
      }, 0);
    });
  }
}

export function escape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stringify(dependency: unknown, handlers: Handler[]): string {
  switch (typeof dependency) {
    case 'undefined':
    case 'boolean':
      return '';
    case 'string':
      return escape(dependency);
    case 'function': {
      const handler = new Handler(dependency as EventListener);
      handlers.push(handler);
      return handler.toString();
    }
    case 'object':
      if (dependency === null) {
        return '';
      } else if (Array.isArray(dependency)) {
        return dependency.map(dependency => stringify(dependency, handlers)).join('');
      } else if ([Component, StateFrame, SafeHtml].some(clazz => dependency instanceof clazz)) {
        return dependency.toString();
      } else {
        try {
          return escape('' + dependency);
        } catch {
          return '';
        }
      }
    default:
      return '' + dependency;
  }
}

export type EventHandler = (event: Event) => unknown;

export type Dependency =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Component
  | StateFrame<any, any>
  | SafeHtml
  | EventHandler
  | readonly Dependency[];

export function mvw(pieces: TemplateStringsArray, ...dependencies: Dependency[]): Component {
  let html = pieces[0] ?? '';
  const handlers: Handler[] = [];
  for (let i = 1; i < pieces.length; i++) {
    const dependency = dependencies[i - 1];
    html += stringify(dependency, handlers) + pieces[i];
  }
  return new Component(html, handlers);
}

export function state<P extends StatefulProps = StatefulProps, S extends Props = Props>(
  fn: StatefulTemplateFunction<P, S>,
  props: P,
  state?: Partial<S>,
): StateFrame<P, S> {
  return new StateFrame<P, S>(fn, props, state || null);
}

export function stateful<P extends StatefulProps = StatefulProps, S extends Props = Props>(
  fn: StatefulTemplateFunction<P, S>,
): (props: P, state?: Partial<S>) => StateFrame<P, S> {
  return (props: P, state?: Partial<S>) => new StateFrame<P, S>(fn, props, state || null);
}

class SafeHtml {
  public constructor(public readonly html: string) {}

  public toString(): string {
    return this.html;
  }
}

export type { SafeHtml };

export function html(pieces: TemplateStringsArray): SafeHtml {
  if (pieces.length > 1) {
    throw new Error('interpolation is forbidden inside raw HTML');
  }
  if (pieces.length > 0) {
    return new SafeHtml(pieces[0]!);
  }
  return new SafeHtml('');
}

export function select<P extends Props, R extends { [value: string]: unknown }>(
  expression: unknown,
  cases: { [K in keyof R]: (props: NoInfer<P>, state?: Props) => R[K] },
  props?: P,
  state?: Props,
): R[keyof R] {
  const value = '' + expression;
  if (Object.prototype.hasOwnProperty.call(cases, value)) {
    return cases[value]!(props || ({} as P), state);
  } else {
    throw new Error(`invalid select key ${JSON.stringify(value)}`);
  }
}

export function style(props: { [key: string]: string | number }): SafeHtml {
  const css: string[] = [];
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      const formattedKey = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
      css.push(`${formattedKey}: ${props[key]};`);
    }
  }
  return new SafeHtml(`style="${escape(css.join(' '))}"`);
}

export function mount<S extends Props>(
  parentElement: Element,
  fn: StatefulTemplateFunction<StatefulProps, S>,
  props?: StatefulProps,
  state?: Partial<S>,
): Promise<void>;

export function mount<P extends StatefulProps, S extends Props>(
  parentElement: Element,
  fn: StatefulTemplateFunction<P, S>,
  props: P,
  state?: Partial<S>,
): Promise<void>;

export function mount<P extends StatefulProps, S extends Props>(
  parentElement: Element,
  fn: StatefulTemplateFunction<P, S>,
  props?: P,
  state?: Partial<S>,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const render = () => {
      try {
        const root = new StateFrame(fn, props || ({ key: 'root' } as P), state || null);
        parentElement.innerHTML = root.toString();
      } catch (e) {
        reject(e);
        return;
      }
      resolve();
    };
    if (document.readyState !== 'loading') {
      render();
    } else {
      window.addEventListener('DOMContentLoaded', render);
    }
  });
}

export function mountBody<S extends Props>(
  fn: StatefulTemplateFunction<StatefulProps, S>,
  props?: StatefulProps,
  state?: Partial<S>,
): Promise<void>;

export function mountBody<P extends StatefulProps, S extends Props>(
  fn: StatefulTemplateFunction<P, S>,
  props: P,
  state?: Partial<S>,
): Promise<void>;

export function mountBody<P extends StatefulProps, S extends Props>(
  fn: StatefulTemplateFunction<P, S>,
  props?: P,
  state?: Partial<S>,
): Promise<void> {
  return mount(document.body, fn, props as P, state);
}
