import { Component, type ReactNode } from 'react'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <main className="public-loading" role="alert"><strong>页面暂时无法显示</strong><p>已保存的资料没有被清除。请重新加载；若问题持续，请保留浏览器数据并联系顾问。</p><button onClick={() => location.reload()}>重新加载页面</button></main>
    return this.props.children
  }
}
