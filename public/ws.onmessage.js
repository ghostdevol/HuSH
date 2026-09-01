ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  const box = document.getElementById("messages");

  if (data.type === "history") {
    // Clear display and populate old logs
    box.innerHTML = "";
    data.messages.forEach(m => {
      box.innerHTML += "<div>" + m.user + ": " + m.text + "</div>";
    });
  } else {
    // Append individual new message
    box.innerHTML += "<div>" + data.user + ": " + data.text + "</div>";
  }
  box.scrollTop = box.scrollHeight;
};
