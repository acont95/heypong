from pydantic import BaseModel, Field, Json
from uuid import UUID, uuid4
from typing import Union, Any, Literal

class OfferAnswer(BaseModel):
    type: Literal['offer', 'answer']
    target: UUID
    caller: UUID
    description: dict