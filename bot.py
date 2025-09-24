import json
import importlib
import os
from fbchat import Client
from fbchat.models import *

# Load AppState
with open("appstate.json", "r") as f:
    appstate = json.load(f)

# Command Loader
def load_commands():
    commands = {}
    base_path = "commands"
    for file in os.listdir(base_path):
        if file.endswith(".py"):
            module_path = f"{base_path}.{file[:-3]}"
            module = importlib.import_module(module_path)
            if hasattr(module, "run"):
                cmd_name = getattr(module, "COMMAND", file[:-3])
                commands[cmd_name] = module
    return commands

commands = load_commands()
group_lock = {}
name_lock = {}

class CommandBot(Client):
    def onMessage(self, author_id, message_object, thread_id, thread_type, **kwargs):
        if author_id == self.uid:
            return

        msg_text = message_object.text.strip().lower() if message_object.text else ""

        # Run matching command
        for cmd, module in commands.items():
            if msg_text.startswith(cmd):
                module.run(self, message_object, thread_id, thread_type, group_lock, name_lock)
                return

        # If group lock is active
        if group_lock.get(thread_id, False):
            self.delete_messages(message_object.uid)
            self.send(Message(text="🚫 Group is locked!"),
                      thread_id=thread_id, thread_type=thread_type)
            return

        # Default auto-reply
        self.send(Message(text=f"🤖 Auto
