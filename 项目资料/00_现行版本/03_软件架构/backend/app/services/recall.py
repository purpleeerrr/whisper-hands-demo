"""Application service for explainable, context-triggered recall."""

from datetime import UTC, datetime

from ..domain.models import ContextChanged, RecallCandidate
from ..ports import FeedbackPort, Repository


class RecallService:
    def __init__(self, repository: Repository, feedback: FeedbackPort) -> None:
        self.repository = repository
        self.feedback = feedback

    def on_context_changed(self, context: ContextChanged) -> list[RecallCandidate]:
        candidates = self.repository.find_recall_candidates(context)
        if not candidates:
            return []

        now = datetime.now(UTC)
        for candidate in candidates:
            self.repository.queue_recall(candidate, now=now)

        # One quiet hardware signal announces a queue, not one buzz per record.
        self.feedback.recall_available()
        return candidates
