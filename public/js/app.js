let ws;
let currentRoom = "";

function createRoom() {
  const room = document.getElementById("roomName").value;
  fetch("/createRoom", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({room})
  });
}

function joinRoom() {
  currentRoom = document.getElementById("roomName").value;
  document.getElementById("roomTitle").innerText = currentRoom;
  document.getElementById("chat").style.display = "block";

  ws = new WebSocket("ws://localhost:5174");

  ws.onopen = () => ws.send(JSON.stringify({type:"join", room:currentRoom}));

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    const box = document.getElementById("messages");
    box.innerHTML += "<div>"+data.user+": "+data.text+"</div>";
    box.scrollTop = box.scrollHeight;
  };
}

function sendMsg() {
  const text = document.getElementById("msgInput").value;
  ws.send(JSON.stringify({type:"msg", room:currentRoom, text}));
}
