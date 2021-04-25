from pydantic import BaseModel
from uuid import UUID
from typing import Literal

class IceCandidate(BaseModel):
    type: str = "new-ice-candidate"
    target: UUID
    caller: UUID
    candidate: dict