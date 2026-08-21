export class DetectionGate {
  constructor({ hitsToTrigger = 2, missesToRelease = 3 } = {}) {
    this.hitsToTrigger = hitsToTrigger;
    this.missesToRelease = missesToRelease;
    this.hits = 0;
    this.misses = 0;
    this.found = false;
  }

  update(isPositive) {
    let trigger = false;

    if (isPositive) {
      this.misses = 0;
      this.hits += 1;
      if (!this.found && this.hits >= this.hitsToTrigger) {
        this.found = true;
        trigger = true;
      }
    } else {
      this.hits = 0;
      if (this.found) {
        this.misses += 1;
        if (this.misses >= this.missesToRelease) {
          this.found = false;
          this.misses = 0;
        }
      }
    }

    return { found: this.found, trigger };
  }
}

export function isStrongRecognition({ numMatches, goodMatches }, { minMatches = 18, minInliers = 10, minInlierRatio = 0.40 } = {}) {
  if (numMatches < minMatches || goodMatches < minInliers) return false;
  return (goodMatches / numMatches) >= minInlierRatio;
}
