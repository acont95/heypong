from pydantic import BaseModel
from uuid import UUID
from typing import Literal, List

class UserTyping(BaseModel):
    type: Literal['typing']
    target: List[UUID]
    caller: UUID