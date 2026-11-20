"""Explicit operation ownership. Host transports continue to call engine.run."""
from . import annotations, questions, suggestions, roles, reading, references, word, drafts, flash_jev, logic_work, translation, heading_links, document

HANDLERS = {}
for module in (annotations, questions, suggestions, roles, reading, references, word, drafts, flash_jev, logic_work, translation, heading_links, document):
    for operation in module.OPERATIONS:
        if operation in HANDLERS:
            raise RuntimeError("Duplicate feature operation: " + operation)
        HANDLERS[operation] = module.handle
