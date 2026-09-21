import { Component } from "react";

// Catches an error thrown while rendering (or in an effect, or while a lazy piece of the
// site downloads) anywhere inside it, and shows `fallback` instead. Without one, React
// unmounts the WHOLE app on any such error and the visitor is left with a blank page.
//
//   <ErrorBoundary fallback={null}>…decorative bit…</ErrorBoundary>   // just disappears
//   <ErrorBoundary fallback={<Sorry />}>…a page…</ErrorBoundary>       // friendly screen
//
// Give it a `key` that changes when the visitor moves on (e.g. the URL) so it starts fresh.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // Still visible to whoever opens the console; the visitor just doesn't see a blank page.
    console.error("[ErrorBoundary]", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
