import React from 'react'
import { View, FlatList, TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { useInbox, useMarkMessageRead, useDismissMessage } from '@/hooks/use-inbox'

export default function InboxScreen() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } = useInbox()
  const markRead = useMarkMessageRead()
  const dismiss = useDismissMessage()

  const messages = data?.pages.flatMap(p => p.messages) ?? []

  if (isLoading) return <ActivityIndicator style={styles.center} />
  if (isError) return (
    <View style={styles.center}>
      <Text>Failed to load inbox</Text>
      <TouchableOpacity onPress={() => refetch()}><Text>Retry</Text></TouchableOpacity>
    </View>
  )

  return (
    <FlatList
      data={messages}
      keyExtractor={item => item.id}
      onEndReached={() => hasNextPage && fetchNextPage()}
      onEndReachedThreshold={0.3}
      ListFooterComponent={isFetchingNextPage ? <ActivityIndicator /> : null}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.item, !item.read && styles.unread]}
          onPress={() => markRead.mutate(item.id)}
          onLongPress={() => dismiss.mutate(item.id)}
        >
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </TouchableOpacity>
      )}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  item: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  unread: { backgroundColor: '#f0f8ff' },
  title: { fontWeight: '600', fontSize: 16 },
  body: { marginTop: 4, color: '#555' },
  date: { marginTop: 4, fontSize: 12, color: '#999' },
})
