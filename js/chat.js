let chatIdCounter = 0;

class Chat {
    /** 
     * @param {{_id: string, username: string}} user 
     * */
    constructor(user, ctrl, $http, globals) {
        this.id = chatIdCounter++;
        this.user = user;
        this.ctrl = ctrl;
        this.globals = globals;
        this.inputMsg = '';

        this.sticks = true;

        /** @type {{
         * time: string, 
         * timestamp: number, 
         * from: string, 
         * content: string[], 
         * leftSide: boolean
         * }[]} */
        this.messages = [];

        $http.get(`/message?userId=${this.user._id}`).then(rep => {
            rep.data.forEach(msg => this.pushMessage(msg, false));
            this._stickToBottom();
        }).catch(console.error);
    }

    onKeyDown(event) {
        if(event.key === 'Enter')
            this.sendMessage();
    }

    focusInput() {
        try {
            const chatInput = document.getElementById(`chat_input_${this.id}`)
            if(chatInput)
                chatInput.focus();
        }
        catch(e) {
            console.error(e);
        }
    }

    sendMessage() {
        if(this.inputMsg.trim().length < 1)
            return;

        this.ctrl.sendMessage(this.user, this.inputMsg.trim());
        this.inputMsg = '';
    }

    onScroll() {
        const container = document.getElementById(`chat_${this.id}`);
        if(!container) return;

        this.sticks = container.clientHeight + container.scrollTop+32 >= container.scrollHeight;
    }

    _stickToBottom() {
        const container = document.getElementById(`chat_${this.id}`);
        if(!container || !this.sticks) return;
            
        setTimeout(() => {
            container.scrollTop = container.scrollHeight + container.clientHeight;
        }, 16);
    }

    /** @param {{_id: string, from: string, content: string}} msg */
    pushMessage(msg, stick = true) {
        function getPreviousMsgIndex(arr, timestamp) {
            for(let i=arr.length-1; i>=0; i--) {
                if(arr[i].timestamp < timestamp)
                    return i;
            }
        
            return -1;
        }

        const timestamp = parseInt(msg._id.substring(0, 8), 16) * 1000;
        const date = new Date(timestamp);
        const now = new Date();

        const sameDay = 
            date.getDay() === now.getDay() && 
            date.getMonth() === now.getMonth() && 
            date.getFullYear() === now.getFullYear();

        const newMsg = {
            time: sameDay ? date.toLocaleTimeString() : date.toLocaleString(),
            timestamp,
            from: msg.from === this.user._id ? this.user.username : this.globals.username,
            content: [msg.content],
            leftSide: msg.from === this.user._id
        };
        
        //smart push
        const last_i = getPreviousMsgIndex(this.messages, timestamp);
        
        //same user wrote again since last message but no more than minute after top message on stack
        if(last_i !== -1 && this.messages[last_i].leftSide === newMsg.leftSide && timestamp - this.messages[last_i].timestamp < 1000*60) 
        {
            this.messages[last_i].content.push(...newMsg.content);
        }
        else {
            this.messages.splice(last_i + 1, 0, newMsg);//push at proper position
            
            while(this.messages.length > 1024)//maximum messages
                this.messages.shift();
        }

        if(stick)
            this._stickToBottom();
    }
}