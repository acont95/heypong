from typing import Literal
from pydantic import BaseModel
from uuid import UUID
from typing import List

class ChatMessage(BaseModel):
    type: Literal['chat']
    message: str
    target: List[UUID]
    caller: UUID