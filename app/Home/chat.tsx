import React, { useEffect, useRef, useState } from 'react'
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native'
import { GiftedChat, IMessage } from 'react-native-gifted-chat'
import { useGetChatToken, useChatHistory } from '@/hooks/use-chat'
import { initializeAbly, subscribeToChannel, publishMessage, closeAbly } from '@/services/ably-chat'

export default function ChatScreen() {
  const getToken = useGetChatToken()
  const [channelId, setChannelId] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(true)
  const { data: history, isLoading: historyLoading } = useChatHistory('care_manager')
  const [messages, setMessages] = useState<IMessage[]>([])
  // Track whether we've kicked off the init so StrictMode double-fire doesn't double-init
  const initStarted = useRef(false)

  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true

    getToken.mutate('care_manager', {
      onSuccess: (data) => {
        setChannelId(data.channelId)
        setTokenLoading(false)
      },
      onError: () => {
        setTokenError(true)
        setTokenLoading(false)
      },
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!channelId) return
    let unsub: (() => void) | undefined

    initializeAbly('care_manager').then(({ channelId: resolvedChannelId }) => {
      subscribeToChannel(resolvedChannelId, (msg) => {
        setMessages((prev) =>
          GiftedChat.append(prev, [
            {
              _id: msg.id || Date.now(),
              text: (msg.data as { content?: string })?.content || '',
              createdAt: new Date(),
              user: {
                _id: (msg.data as { senderId?: string })?.senderId || 'care_manager',
                name: 'Care Manager',
              },
            },
          ])
        )
      }).then((fn) => {
        unsub = fn
      })
    })

    return () => {
      unsub?.()
      closeAbly()
    }
  }, [channelId])

  useEffect(() => {
    if (history) {
      setMessages(
        history.map((m) => ({
          _id: m.id,
          text: m.content,
          createdAt: new Date(m.createdAt),
          user: {
            _id: m.role === 'user' ? 'me' : 'care_manager',
            name: m.role === 'user' ? 'You' : 'Care Manager',
          },
        }))
      )
    }
  }, [history])

  const handleSend = (outgoing: IMessage[]) => {
    if (!channelId || outgoing.length === 0) return
    const msg = outgoing[0]
    // Optimistically append the sent message
    setMessages((prev) => GiftedChat.append(prev, outgoing))
    // Publish via Ably so the care manager receives it in real time
    publishMessage(channelId, 'message', {
      content: msg.text,
      senderId: 'me',
    }).catch(() => {
      // Silently swallow publish errors — the message is already shown optimistically
    })
  }

  if (tokenLoading || historyLoading) return <ActivityIndicator style={styles.center} />

  if (tokenError)
    return (
      <View style={styles.center}>
        <Text>Could not connect to chat</Text>
      </View>
    )

  return (
    <GiftedChat
      messages={messages}
      onSend={handleSend}
      user={{ _id: 'me' }}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
})
