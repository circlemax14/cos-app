import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CustomChat, IMessage, User } from '@/components/ui/custom-chat';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { useSendAiMessage, useChatHistory } from '@/hooks/use-chat';
import { useCanRender } from '@/hooks/use-entitlement';

// COS-723: expo-router renders this in its `Try` boundary if the route throws,
// so a crash costs this screen instead of the whole app. See
// components/RouteErrorBoundary.tsx.
export { ErrorBoundary } from '@/components/RouteErrorBoundary';

// AI Bot User Definition
const AI_USER: User = {
    _id: 'ai-health-coach',
    name: 'Health Coach AI',
    avatar: 'https://ui-avatars.com/api/?name=Health+Coach&background=0D8ABC&color=fff',
};

const CURRENT_USER: User = {
    _id: 'user',
    name: 'You',
};

export default function HealthChatScreen() {
    const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
    const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];

    // Entitlement gate. Declared here, above every early return, because it is
    // a hook. useCanRender fails open — false only on an affirmative deny.
    const canView = useCanRender('health-chat.view');

    const { data: historyMessages, isLoading: isHistoryLoading, isError: isHistoryError, refetch } = useChatHistory('ai');
    const sendAiMessage = useSendAiMessage();

    /*
     * SCRUM-639 — prefill auto-send. When callers push into this screen
     * with `?prefill=<encoded>&context=<ctx>`, the first render after
     * history loads sends that message once on the user's behalf so
     * the AI can answer without the user having to re-type. Guarded on
     * a ref so hot-reload / re-focus doesn't re-fire.
     *
     * Common producers: ReadinessScoreCard "Why?" button (context=
     * 'readiness-explain'), future daily-nudge deep-links.
     */
    const params = useLocalSearchParams<{ prefill?: string; context?: string }>();
    const prefill = typeof params.prefill === 'string' ? params.prefill : undefined;
    const prefillContext = typeof params.context === 'string' ? params.context : 'general';
    const prefillSentRef = useRef(false);

    useEffect(() => {
        if (!prefill) return;
        if (prefillSentRef.current) return;
        // Wait for history to finish loading so the auto-sent message doesn't
        // duplicate a prior identical send in a rare race (user navigated
        // away mid-response, back with same URL).
        if (isHistoryLoading) return;
        prefillSentRef.current = true;
        sendAiMessage.mutate({ message: prefill, context: prefillContext });
    }, [prefill, prefillContext, isHistoryLoading, sendAiMessage]);

    // Map API chat history to IMessage format for display
    const messages: IMessage[] = React.useMemo(() => {
        if (!historyMessages) return [];
        // Reverse so newest is first (GiftedChat/CustomChat convention)
        return [...historyMessages].reverse().map(m => ({
            _id: m.id,
            text: m.content,
            createdAt: new Date(m.createdAt),
            user: m.role === 'user' ? CURRENT_USER : AI_USER,
        }));
    }, [historyMessages]);

    const onSend = useCallback((newMessages: IMessage[] = []) => {
        if (newMessages.length === 0) return;
        const userInput = newMessages[0].text;
        sendAiMessage.mutate({ message: userInput, context: 'general' });
    }, [sendAiMessage]);

    if (isHistoryLoading) {
        return (
            <AppWrapper>
                <View style={[styles.container, { backgroundColor: colors.background }]}>
                    <View style={[styles.header, { borderBottomColor: colors.text + '20' }]}>
                        <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
                            Health Chat
                        </Text>
                        <Text style={[styles.headerSubtitle, { color: colors.text + '80', fontSize: getScaledFontSize(14) }]}>
                            Your AI Health Assistant
                        </Text>
                    </View>
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color={colors.tint} />
                    </View>
                </View>
            </AppWrapper>
        );
    }

    if (isHistoryError) {
        return (
            <AppWrapper>
                <View style={[styles.container, { backgroundColor: colors.background }]}>
                    <View style={[styles.header, { borderBottomColor: colors.text + '20' }]}>
                        <Text style={[styles.headerTitle, { color: colors.text, fontSize: getScaledFontSize(20), fontWeight: getScaledFontWeight(700) as any }]}>
                            Health Chat
                        </Text>
                    </View>
                    <View style={styles.centered}>
                        <Text style={{ color: colors.text, marginBottom: 12 }}>Failed to load chat history</Text>
                        <TouchableOpacity onPress={() => refetch()} style={[styles.retryButton, { backgroundColor: colors.tint }]}>
                            <Text style={styles.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </AppWrapper>
        );
    }

    return (
        <AppWrapper>
            {canView && (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: colors.text + '20' }]}>
                    <Text style={[
                        styles.headerTitle,
                        {
                            color: colors.text,
                            fontSize: getScaledFontSize(20),
                            fontWeight: getScaledFontWeight(700) as any,
                        }
                    ]}>
                        Health Chat
                    </Text>
                    <Text style={[
                        styles.headerSubtitle,
                        {
                            color: colors.text + '80',
                            fontSize: getScaledFontSize(14),
                        }
                    ]}>
                        Your AI Health Assistant
                    </Text>
                </View>

                <View style={styles.chatContainer}>
                    <CustomChat
                        messages={messages}
                        onSend={onSend}
                        user={CURRENT_USER}
                        placeholder="Ask me anything about your health..."
                        isTyping={sendAiMessage.isPending}
                        showAvatar={false}
                    />
                </View>
            </View>
            )}
        </AppWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        alignItems: 'center',
    },
    headerTitle: {
        textAlign: 'center',
    },
    headerSubtitle: {
        textAlign: 'center',
        marginTop: 4,
    },
    chatContainer: {
        flex: 1,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    retryButton: {
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 8,
    },
    retryText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
