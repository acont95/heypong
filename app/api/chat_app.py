from app.models.ice_candidate import IceCandidate
from fastapi import FastAPI, WebSocket
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.websockets import WebSocketClose, WebSocketDisconnect
from app.models.offer_answer import OfferAnswer
from app.models.chat_message import ChatMessage
from app.models.disconnect import Disconnect
import uuid 
from typing import Dict
from collections import OrderedDict

app = FastAPI()
app.mount("/static", StaticFiles(directory="app/static"), name="static")

templates = Jinja2Templates(directory='app/templates')

@app.get('/', response_class=HTMLResponse)
def home_page(request: Request):
    return templates.TemplateResponse('cam_chat.html', context = {'request':request})

@app.get('/num_users')
def num_users():
    return {'num_users': manager.n_users}

@app.get('/new_peer')
def new_peer(client_id: str):
    print(manager.waiting)
    if client_id not in manager.waiting:
        if (manager.waiting):
            return {'peer': manager.waiting.popitem(last=False)[0]}
        else:
            manager.waiting[client_id] = None
            return {'peer': None}
    # if (manager.waiting) and (client_id not in manager.waiting):
    #     return {'peer': manager.waiting.popitem(last=False)}
    # else:
    #     if not client_id in manager.waiting:
    #         manager.waiting.append(client_id)
    #     return {'peer': None} 

class ConnectionManager:
    def __init__(self):
        self.n_users = 0
        self.connections: Dict[str, WebSocket] = {}
        self.waiting: OrderedDict[str, None] = OrderedDict()

    async def connect(self, websocket: WebSocket, _id: str):
        await websocket.accept()
        self.connections[_id] = websocket
        await websocket.send_json(
            {   
                'type' : 'client-identifier',
                'id' : _id
            }
        )
        self.n_users += 1

    def disconnect(self, websocket: WebSocket, _id: str):
        del self.connections[_id]
        self.n_users -= 1    

    async def process_signal(self, message: str):
        if message['type'] == 'new-ice-candidate':
            connection = self.connections[message['target']]
            ice_candidate = IceCandidate(
                    target = message['target'],
                    caller = message['caller'],
                    candidate = message['candidate']
                )
            await connection.send_json(
                {
                    'type' : ice_candidate.type,
                    'target' : ice_candidate.target.hex,
                    'caller' : ice_candidate.caller.hex,
                    'candidate' : ice_candidate.candidate
                }
            )

        elif (message['type'] == 'offer'):
            connection = self.connections[message['target']]
            offer = OfferAnswer(
                    type = message['type'],
                    description = message['description'],
                    target = message['target'],
                    caller = message['caller']
            )
            await connection.send_json(
                {
                    'type' : offer.type,
                    'description' : offer.description,
                    'target' : offer.target.hex,
                    'caller' : offer.caller.hex
                }
            )

        elif (message['type'] == 'answer'):
            connection = self.connections[message['target']]
            answer = OfferAnswer(
                    type = message['type'],
                    description = message['description'],
                    target = message['target'],
                    caller = message['caller']
            )
            await connection.send_json(
                {
                    'type' : answer.type,
                    'description' : answer.description,
                    'target' : answer.target.hex,
                    'caller' : answer.caller.hex
                }
            )

        elif (message['type'] == 'chat'):
            message = ChatMessage(
                type = message['type'],
                message = message['message'],
                target = message['target'],
                caller = message['caller']
            )
            for target in message.target:
                await self.connections[target.hex].send_json(
                    {
                        'type' : message.type,
                        'message' : message.message,
                        'target' : target.hex,
                        'caller' : message.caller.hex
                    }
                )

        elif (message['type'] == 'disconnect'):
            message = Disconnect(
                type = message['type'],
                target = message['target'],
                caller = message['caller']
            )

            for target in message.target:
                await self.connections[target.hex].send_json(
                    {
                        'type' : message.type,
                        'target' : target.hex,
                        'caller': message.caller.hex
                    }
                )


manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    _id = uuid.uuid4().hex
    await manager.connect(websocket = websocket, _id = _id)
    try:
        while True:
            message = await websocket.receive_json()
            print(_id)
            print(message['type'], message['caller'])
            await manager.process_signal(message)
        
    except WebSocketDisconnect:
        manager.disconnect(websocket = websocket, _id = _id)