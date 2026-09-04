(() => {
  function currentRecommendation(item, detectorVersion) {
    if (item?.mediaType !== 'image') return null;
    const recommendation = item?.classificationRecommendation;
    return recommendation?.detectorVersion === detectorVersion ? recommendation : null;
  }

  function detectionCandidates(items, view, detectorVersion) {
    const targetStatus = view === 'tagged' ? 'tagged' : 'review';
    const unique = new Map();
    for (const item of items || []) {
      if (
        item.mediaType === 'image'
        && item.status === targetStatus
        && !currentRecommendation(item, detectorVersion)
        && !unique.has(item.contentHash)
      ) {
        unique.set(item.contentHash, item);
      }
    }
    return [...unique.values()];
  }

  function taggedPeopleSummary(items, detectorVersion) {
    const analyzed = (items || []).filter((item) => (
      item.status === 'tagged' && currentRecommendation(item, detectorVersion)
    ));
    return {
      analyzedFiles: analyzed.length,
      peopleFiles: analyzed.filter((item) => item.classificationRecommendation.hasPerson).length,
    };
  }

  function viewAfterPeopleDetection(startingView) {
    return startingView === 'tagged' ? 'tagged' : 'people';
  }

  window.classificationView = Object.freeze({
    currentRecommendation,
    detectionCandidates,
    taggedPeopleSummary,
    viewAfterPeopleDetection,
  });
})();
