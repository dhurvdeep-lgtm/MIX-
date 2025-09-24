from fbchat.models import Message, ThreadType

COMMAND = "gnamelock"

def run(client, message_object, thread_id, thread_type, group_lock, name_lock):
    text = message_object.text.lower().strip()
    if text == "gnamelock on":
        thread_info = client.fetchThreadInfo(thread_id)[thread_id]
        name_lock[thread_id] = thread_info.name
        client.send(Message(text=f"🔒 Group name locked: {thread_info.name}"),
                    thread_id=thread_id, thread_type=ThreadType.GROUP)
    elif text == "gnamelock off":
        if thread_id in name_lock:
            del name_lock[thread_id]
        client.send(Message(text="🔓 Group name unlocked!"),
                    thread_id=thread_id, thread_type=ThreadType.GROUP)
    else:
        client.send(Message(text="⚙ Usage: gnamelock on | gnamelock off"),
                    thread_id=thread_id, thread_type=ThreadType.GROUP)
