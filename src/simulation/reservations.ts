export class ReservationManager {
  private readonly resources = new Map<string, string>();

  reserve(resourceId: string, ownerId: string): boolean {
    const current = this.resources.get(resourceId);
    if (current && current !== ownerId) return false;
    this.resources.set(resourceId, ownerId);
    return true;
  }

  release(resourceId: string, ownerId: string): boolean {
    if (this.resources.get(resourceId) !== ownerId) return false;
    return this.resources.delete(resourceId);
  }

  releaseAll(ownerId: string): void {
    for (const [resourceId, owner] of this.resources) {
      if (owner === ownerId) this.resources.delete(resourceId);
    }
  }

  ownerOf(resourceId: string): string | undefined {
    return this.resources.get(resourceId);
  }

  resourcesOf(ownerId: string): string[] {
    return [...this.resources]
      .filter(([, owner]) => owner === ownerId)
      .map(([resourceId]) => resourceId);
  }

  snapshot(): ReadonlyMap<string, string> {
    return new Map(this.resources);
  }
}
