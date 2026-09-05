import { Component } from '@geajs/core'

export default class Counter extends Component {
  declare props: { start?: number }
  count = 0

  created(props) {
    this.count = props.start || 0
  }

  increment() { this.count++ }

  template() {
    return (
      <div class="counter">
        <span>{this.count}</span>
        <button click={() => this.increment()}>Increment</button>
      </div>
    )
  }
}
