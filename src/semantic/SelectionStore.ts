type Listener = (ids: string[]) => void

export class SelectionStore {
  private selected: string[] = []
  private listeners: Listener[] = []

  select(ids: string[]): void {
    this.selected = ids
    this.listeners.forEach(l => l(ids))
  }

  getSelected(): string[] {
    return this.selected
  }

  on(listener: Listener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }
}
