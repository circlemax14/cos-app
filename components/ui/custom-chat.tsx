
import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Image,
    Keyboard,
    ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAccessibility } from '@/stores/accessibility-store';
import { Colors } from '@/constants/theme';

export interface User {
    _id: string | number;
    name?: string;
    avatar?: string | number | (() => React.ReactNode);
}

export interface IMessage {
    _id: string | number;
    text: string;
    createdAt: Date | number;
    user: User;
    system?: boolean;
    sent?: boolean;
    received?: boolean;
    pending?: boolean;
}

interface BubbleRenderProps {
    currentMessage: IMessage;
    nextMessage: IMessage | null;
    previousMessage: IMessage | null;
    user: User;
    position: 'left' | 'right';
}

interface InputToolbarRenderProps {
    text: string;
    onTextChanged: (text: string) => void;
    onSend: () => void;
    placeholder: string;
}

interface SendRenderProps {
    text: string;
}

interface CustomChatProps {
    messages: IMessage[];
    onSend: (messages: IMessage[]) => void;
    user: User;
    placeholder?: string;
    isTyping?: boolean;
    renderBubble?: (props: BubbleRenderProps) => React.ReactNode;
    renderInputToolbar?: (props: InputToolbarRenderProps) => React.ReactNode;
    renderSend?: (props: SendRenderProps) => React.ReactNode;
    minInputToolbarHeight?: number;
    showAvatar?: boolean;
}

export function CustomChat({
    messages,
    onSend,
    user,
    placeholder = 'Type a message...',
    isTyping = false,
    renderBubble,
    renderInputToolbar,
    renderSend,
    showAvatar = true,
}: CustomChatProps) {
    const [inputText, setInputText] = useState('');
    const insets = useSafeAreaInsets();
    const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
    const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
    const flatListRef = useRef<FlatList>(null);

    const handleSend = () => {
        if (inputText.trim().length === 0) return;

        const newMessage: IMessage = {
            _id: Math.random().toString(36).substring(7),
            text: inputText.trim(),
            createdAt: new Date(),
            user: user,
        };

        onSend([newMessage]);
        setInputText('');
    };

    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    };

    const getRelativeDate = (date: Date) => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (isSameDay(date, today)) {
            return 'Today';
        } else if (isSameDay(date, yesterday)) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString();
        }
    };


    const renderMessageItem: ListRenderItem<IMessage> = ({ item, index }) => {
        const isMyMessage = item.user._id === user._id;
        // In inverted list, index 0 is the newest message (bottom).
        // So "next" message in time is index - 1 (if index > 0).
        // "Previous" message in time is index + 1.

        const prevMessage = index < messages.length - 1 ? messages[index + 1] : null;
        const nextMessage = index > 0 ? messages[index - 1] : null;

        const isSameUserAsPrev = prevMessage?.user?._id === item.user._id;

        // Date Handling
        const currentDate = new Date(item.createdAt);
        const prevDate = prevMessage ? new Date(prevMessage.createdAt) : null;
        const showDateSeparator = !prevDate || !isSameDay(currentDate, prevDate);


        let bubbleContent;
        if (renderBubble) {
            const bubble = renderBubble({
                currentMessage: item,
                nextMessage: nextMessage,
                previousMessage: prevMessage,
                user,
                position: isMyMessage ? 'right' : 'left',
            });
            bubbleContent = (bubble ?? null) as React.ReactElement | null;
        } else {
            bubbleContent = (
                <View style={[
                    styles.messageContainer,
                    isMyMessage ? styles.myMessageContainer : styles.theirMessageContainer,
                    { marginBottom: isSameUserAsPrev ? 2 : 10 }
                ]}>
                    {showAvatar && !isMyMessage && !isSameUserAsPrev && (
                        <View style={styles.avatarContainer}>
                            {typeof item.user.avatar === 'string' ? (
                                <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
                            ) : (
                                <View style={[styles.avatar, { backgroundColor: colors.tint || '#008080' }]}>
                                    <Text style={styles.avatarText}>
                                        {item.user.name ? item.user.name.charAt(0).toUpperCase() : '?'}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                    {showAvatar && !isMyMessage && isSameUserAsPrev && <View style={styles.avatarSpacer} />}

                    <View style={[
                        styles.bubble,
                        isMyMessage
                            ? { backgroundColor: colors.tint || '#008080', borderBottomRightRadius: 2 }
                            : { backgroundColor: colors.text + '15', borderBottomLeftRadius: 2 }
                    ]}>
                        <Text style={[
                            styles.messageText,
                            isMyMessage ? { color: '#fff' } : { color: colors.text },
                            { fontSize: getScaledFontSize(16), lineHeight: getScaledFontSize(22) } // Improved line height validation
                        ]}>
                            {item.text}
                        </Text>
                    </View>
                </View>
            );
        }

        return (
            <View>
                {showDateSeparator && (
                    <View style={styles.dateSeparator}>
                        <Text style={[styles.dateSeparatorText, { color: colors.text + '60', fontSize: getScaledFontSize(12) }]}>
                            {getRelativeDate(currentDate)}
                        </Text>
                    </View>
                )}
                {bubbleContent}
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessageItem}
                keyExtractor={(item) => item._id.toString()}
                inverted
                contentContainerStyle={styles.listContent}
                keyboardDismissMode="interactive"
                keyboardShouldPersistTaps="handled"
                ListFooterComponent={
                    isTyping ? (
                        <View style={styles.typingContainer}>
                            <View style={[styles.typingBubble, { backgroundColor: colors.text + '10' }]}>
                                <ActivityIndicator size="small" color={colors.text} />
                            </View>
                        </View>
                    ) : null
                }
            />

            {renderInputToolbar ? renderInputToolbar({
                text: inputText,
                onTextChanged: setInputText,
                onSend: handleSend,
                placeholder
            }) : (
                <View style={[
                    styles.inputContainer,
                    {
                        backgroundColor: colors.background,
                        borderTopColor: colors.text + '20',
                        paddingBottom: Math.max(insets.bottom, 10),
                        paddingTop: 10
                    }
                ]}>
                    <TextInput
                        style={[
                            styles.input,
                            {
                                backgroundColor: settings.isDarkTheme ? '#1c1c1e' : '#f2f2f7',
                                color: colors.text,
                                fontSize: getScaledFontSize(16),
                                minHeight: getScaledFontSize(44), // Ensure minimum height is scalable
                                paddingVertical: getScaledFontSize(10), // Add padding for large text
                            }
                        ]}
                        placeholder={placeholder}
                        placeholderTextColor={colors.text + '60'}
                        multiline
                        value={inputText}
                        onChangeText={setInputText}
                        maxLength={1000}
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            {
                                opacity: inputText.trim().length > 0 ? 1 : 0.5,
                                height: getScaledFontSize(44), // Scalable button height
                                width: getScaledFontSize(44), // Scalable button width
                            }
                        ]}
                        onPress={handleSend}
                        disabled={inputText.trim().length === 0}
                    >
                        {renderSend ? (
                            renderSend({ text: inputText })
                        ) : (
                            <IconSymbol name="paperplane.fill" size={getScaledFontSize(24)} color={colors.tint || '#008080'} />
                        )}
                    </TouchableOpacity>
                </View>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 10,
        borderTopWidth: 1,
    },
    input: {
        flex: 1,
        borderRadius: 22,
        paddingHorizontal: 16,
        marginRight: 10,
        maxHeight: 120, // Increased max height
    },
    sendButton: {
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 0,
    },
    messageContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 10,
    },
    myMessageContainer: {
        justifyContent: 'flex-end',
    },
    theirMessageContainer: {
        justifyContent: 'flex-start',
    },
    avatarContainer: {
        marginRight: 8,
    },
    avatarSpacer: {
        width: 32,
        marginRight: 8,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    bubble: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 16,
    },
    messageText: {
        // Line height handled in component
    },
    typingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        marginLeft: 40, // Offset for avatar
    },
    typingBubble: {
        padding: 10,
        borderRadius: 16,
        borderBottomLeftRadius: 2,
    },
    dateSeparator: {
        alignItems: 'center',
        marginVertical: 16,
        marginBottom: 20,
    },
    dateSeparatorText: {
        fontWeight: '500',
    },
});
