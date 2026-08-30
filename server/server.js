const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const roomsFile = path.join(__dirname, "data", "rooms.json");
if (!fs.existsSync(roomsFile)) fs.writeFileSync(roomsFile, "{}");

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/createRoom") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      const {room} = JSON.parse(body);
      const rooms = JSON.parse(fs.readFileSync(roomsFile));
      rooms[room] = rooms[room] || [];
      fs.writeFileSync(roomsFile, JSON.stringify(rooms));
      res.end("Room created");
    });
    return;
  }

  let filePath = path.join(__dirname, "..", "public", req.url === "/" ? "index.html" : req.url);
  const ext = path.extname(filePath);
  const types = {
    ".html":"text/html",".css":"text/css",".js":"application/javascript"
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {res.writeHead(404);return res.end("404");}
    res.writeHead(200, {"Content-Type": types[ext] || "text/plain"});
    res.end(content);
  });
});

const wss = new WebSocket.Server({port:5174});
const clients = {};

wss.on("connection", ws => {
  ws.on("message", msg => {
    const data = JSON.parse(msg);

    if (data.type === "join") {
      ws.room = data.room;
      clients[ws.room] = clients[ws.room] || [];
      clients[ws.room].push(ws);
    }

    if (data.type === "msg") {
      clients[data.room].forEach(client => {
        client.send(JSON.stringify({
          user:"User",
          text:data.text
        }));
      });
    }
  });
});

server.listen(5173, () => console.log("HuSH HTTP running on 5173"));
console.log("HuSH WebSocket running on 5174");
