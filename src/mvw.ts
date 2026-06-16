class Handler {
  private static _nextId = 1;
  public static handlers: { [id: number]: EventListener } = Object.create(null);

  public readonly id: number;

  public constructor(fn: EventListener) {
    this.id = Handler._nextId++;
    Handler.handlers[this.id] = fn;
  }

  public toString(): string {
    return `"$__mvw_handlers[${this.id}].call(this, event)"`;
  }
}

(window as any).$__mvw_handlers = Handler.handlers;

export interface Props {
  [key: string]: unknown;
}

export class Component {
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

export type TemplateFunction = (props: Props, state?: Props) => Component;

export class StateFrame {
  private static _nextId = 0;

  public readonly id: string;
  private readonly _fn: TemplateFunction;
  private readonly _props: Props;
  private _state: Props | null;
  private _component: Component;

  public constructor(fn: TemplateFunction, props: Props, state: Props | null) {
    this.id = `$__mvw_state_${StateFrame._nextId++}`;
    this._fn = fn;
    this._props = props;
    this._props['self'] = this;
    this._state = state;
    this._component = this.render();
  }

  public render(): Component {
    const component = this._state ? this._fn(this._props, this._state) : this._fn(this._props);
    const fragment = component.template.content;
    const element = fragment.childNodes[0] as Element;
    element.id = this.id;
    return component;
  }

  public toString(): string {
    return this._component.toString();
  }

  private static _destroyHandlers(element: Element): void {
    const ids = element.getAttribute('data-mvw-handlers');
    if (ids) {
      for (const id of ids.split(',')) {
        delete Handler.handlers[parseInt(id, 10)];
      }
    }
  }

  public update(state: Props): StateFrame {
    const oldElement = document.getElementById(this.id);
    if (oldElement) {
      const children = oldElement.querySelectorAll('[data-mvw-handlers]');
      for (let i = 0; i < children.length; i++) {
        StateFrame._destroyHandlers(children[i]!);
      }
      StateFrame._destroyHandlers(oldElement);
    } else {
      console.error(`element ${this.id} not found`);
    }
    if (!this._state) {
      this._state = {};
    }
    for (const key in state) {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        this._state[key] = state[key];
      }
    }
    this._component = this.render();
    if (oldElement) {
      const newElement = this._component.template.content.childNodes[0] as Element;
      oldElement.parentNode!.replaceChild(newElement, oldElement);
    }
    return this;
  }

  public updateSoon(state: Props): Promise<void> {
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
    .replace('&', '&amp;')
    .replace('<', '&lt;')
    .replace('>', '&gt;')
    .replace('"', '&quot;')
    .replace("'", '&apos;');
}

function stringify(dependency: unknown, handlers: Handler[]): string {
  switch (typeof dependency) {
    case 'undefined':
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
      } else {
        return '' + dependency;
      }
    default:
      return '' + dependency;
  }
}

export function mvw(pieces: TemplateStringsArray, ...dependencies: unknown[]): Component | null {
  if (pieces.length < 1) {
    return null;
  }
  let html = pieces[0]!;
  const handlers: Handler[] = [];
  for (let i = 1; i < pieces.length; i++) {
    const dependency = dependencies[i - 1];
    html += stringify(dependency, handlers) + pieces[i];
  }
  return new Component(html, handlers);
}

export function state(fn: TemplateFunction, props?: Props, state?: Props): StateFrame {
  return new StateFrame(fn, props || {}, state || null);
}

export class SafeHtml {
  public constructor(public readonly html: string) {}

  public toString(): string {
    return this.html;
  }
}

export function html(pieces: TemplateStringsArray): SafeHtml {
  if (pieces.length > 1) {
    throw new Error('interpolation is forbidden inside raw HTML');
  }
  if (pieces.length > 0) {
    return new SafeHtml(pieces[0]!);
  }
  return new SafeHtml('');
}

export function select<Component>(
  expression: unknown,
  cases: { [value: string]: (props?: Props, state?: Props) => Component },
  props?: Props,
  state?: Props,
): Component {
  return cases[expression as string]!.call(null, props || {}, state || void 0);
}

export function style(props: { [key: string]: string | number }): SafeHtml {
  const css: string[] = [];
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      const formattedKey = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
      const value = props[key];
      if (typeof value !== 'number') {
        css.push(`${formattedKey}: ${value}`);
      } else if (value) {
        css.push(`${formattedKey}: ${value}px`);
      } else {
        css.push(`${formattedKey}: 0`);
      }
    }
  }
  return new SafeHtml(`style="${escape(css.join('; '))}"`);
}

export function bind(
  parentElement: Element,
  fn: TemplateFunction,
  props?: Props,
  state?: Props,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    window.addEventListener('DOMContentLoaded', () => {
      try {
        const root = new StateFrame(fn, props || {}, state || null);
        parentElement.innerHTML = root.toString();
      } catch (e) {
        reject(e);
        return;
      }
      resolve();
    });
  });
}
