if (new URLSearchParams(window.location.search).has('m2')) {
  void import('./demo')
} else {
  void import('./editor')
}
