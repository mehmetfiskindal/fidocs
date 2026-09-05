import { Component } from '@geajs/core'

export default class Callout extends Component {
  declare props: { type?: string; children?: any }

  template({ type, children }) {
    return (
      <div class={`callout callout-${type || 'info'}`}>
        {children}
      </div>
    )
  }
}
