from typing import Literal
from pydantic import BaseModel
from uuid import UUID
from typing import List

class Disconnect(BaseModel):
    type: Literal['disconnect']
    target: List[UUID]
    caller: UUID 