import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { CustomChat, IMessage, User } from '@/components/ui/custom-chat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { getFastenPatient } from '@/services/fasten-health';

// AI Bot User Definition
const AI_USER: User = {
    _id: 'ai-health-coach',
    name: 'Health Coach AI',
    avatar: 'https://ui-avatars.com/api/?name=Health+Coach&background=0D8ABC&color=fff',
};

export default function HealthChatScreen() {
    const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
    const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<IMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [patientName, setPatientName] = useState<string>('');
    const [hasMedicalAccess, setHasMedicalAccess] = useState(false);
    const [pendingMedicalQuery, setPendingMedicalQuery] = useState<string | null>(null);

    // Helper to generate IDs
    const generateId = () => Math.random().toString(36).substring(7);

    // Helper to stream text
    const streamResponse = useCallback((fullText: string) => {
        // Generate a unique ID for this message chunk
        const messageId = generateId();

        // Create the message container with empty text first
        const aiMessage: IMessage = {
            _id: messageId,
            text: " ", // Start with empty space
            createdAt: new Date(),
            user: AI_USER,
        };

        // Add initial empty message
        setMessages((previousMessages) =>
            [aiMessage, ...previousMessages]
        );

        // Start streaming characters
        let currentIndex = 0;
        const streamInterval = setInterval(() => {
            if (currentIndex < fullText.length) {
                const nextChar = fullText[currentIndex];

                setMessages((previousMessages) => {
                    const newMessages = [...previousMessages];
                    const msgIndex = newMessages.findIndex(m => m._id === messageId);

                    if (msgIndex !== -1) {
                        const updatedMsg = { ...newMessages[msgIndex] };
                        // If it's the first char (and we had a space), replace it, otherwise append
                        if (currentIndex === 0) {
                            updatedMsg.text = nextChar;
                        } else {
                            updatedMsg.text += nextChar;
                        }
                        newMessages[msgIndex] = updatedMsg;
                        return newMessages;
                    }
                    return previousMessages;
                });

                currentIndex++;
            } else {
                clearInterval(streamInterval);
            }
        }, 30); // Speed: 30ms per character
    }, []);

    // Load User Name and Start Chat
    useEffect(() => {
        const loadPatient = async () => {
            let name = 'there';
            try {
                const patient = await getFastenPatient();
                if (patient?.name) {
                    name = patient.name;
                }
            } catch (e) {
                console.error('Failed to load patient', e);
            }
            setPatientName(name);

            // Start streaming the initial greeting
            const greeting = `Hello ${name}! I'm your personal Health Coach. How can I help you today?`;
            streamResponse(greeting);
        };

        loadPatient();
    }, [streamResponse]);

    // Simulator for AI responses
    const generateAIResponse = async (userMessage: string, chatHistory: IMessage[]) => {
        setIsTyping(true);

        const context = chatHistory.map(m => `${m.user.name}: ${m.text}`).join('\n');

        // Simulate initial think time
        setTimeout(() => {
            let fullResponseText = "I'm here to support you. How else can I help?";
            const lowerMsg = userMessage.toLowerCase();

            // Medical keywords detection
            const medicalKeywords = ['appointment', 'medication', 'medicine', 'pill', 'feeling', 'pain', 'sick', 'plan', 'treatment', 'doctor', 'lab', 'report', 'health', 'symptom'];
            const isMedicalQuery = medicalKeywords.some(keyword => lowerMsg.includes(keyword));

            // Permission Handling Interaction
            if (pendingMedicalQuery) {
                if (['yes', 'sure', 'ok', 'okay', 'grant', 'allow', 'please'].some(word => lowerMsg.includes(word))) {
                    setHasMedicalAccess(true);
                    setPendingMedicalQuery(null);

                    fullResponseText = "Thank you. I've accessed your medical records. ";

                    if (pendingMedicalQuery.includes('appointment')) {
                        fullResponseText += "I see availability with Dr. Smith next Tuesday at 10 AM. Would you like me to schedule that?";
                    } else if (pendingMedicalQuery.includes('medication') || pendingMedicalQuery.includes('medicine')) {
                        fullResponseText += "You have a prescription for Amoxicillin. Have you taken your morning dose?";
                    } else {
                        fullResponseText += "I can now answer your health questions based on your history. What would you like to know?";
                    }
                } else {
                    setPendingMedicalQuery(null);
                    fullResponseText = "Understood. I will not access your medical records. I can still help with general inquiries.";
                }
            }
            // specific check for medical queries without permission
            else if (isMedicalQuery && !hasMedicalAccess) {
                setPendingMedicalQuery(lowerMsg);
                fullResponseText = `To provide personalized advice about your request, I need permission to access your medical records. Do you grant me permission?`;
            }
            // Already has permission or general query
            else {
                if (lowerMsg.includes('appointment')) {
                    fullResponseText = "I see availability with Dr. Smith next Tuesday at 10 AM. Would you like me to schedule that, or remind you of your upcoming check-up?";
                } else if (lowerMsg.includes('medication') || lowerMsg.includes('medicine') || lowerMsg.includes('pill')) {
                    fullResponseText = "It's important to stay consistent with your medication. Have you taken your morning dose yet? Remember to take it with food if prescribed.";
                } else if (lowerMsg.includes('feeling') || lowerMsg.includes('pain') || lowerMsg.includes('sick')) {
                    fullResponseText = "I'm sorry to hear you're not feeling 100%. While I can track your symptoms, please remember to consult your doctor for any new or worsening symptoms. Should I log this in your health diary?";
                } else if (lowerMsg.includes('plan') || lowerMsg.includes('treatment')) {
                    fullResponseText = "Your current treatment plan suggests 30 minutes of light cardio daily. How is that going for you?";
                } else if (lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
                    fullResponseText = `Hi ${patientName}! Ready to work on your health goals today?`;
                }
            }

            setIsTyping(false);
            streamResponse(fullResponseText);

        }, 1500);
    };

    const user = React.useMemo(() => ({
        _id: 'user',
        name: 'You',
    }), []);

    const onSend = useCallback((newMessages: IMessage[] = []) => {
        setMessages((previousMessages) => {
            const updatedMessages = [...newMessages, ...previousMessages];
            // We need to trigger AI response after state update, but we can't easily wait for it inside the functional update.
            // However, for this simple case, we can just use the values we have.
            if (newMessages.length > 0) {
                const userMsg = newMessages[0].text;
                // Use setTimeout to avoid state update warning and ensure correct execution context
                setTimeout(() => {
                    generateAIResponse(userMsg, updatedMessages);
                }, 0);
            }
            return updatedMessages;
        });
    }, [patientName, hasMedicalAccess, pendingMedicalQuery, streamResponse]);

    return (
        <AppWrapper>
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
                        user={user}
                        placeholder="Ask me anything about your health..."
                        isTyping={isTyping}
                        showAvatar={false}
                    />
                </View>
            </View>
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
});
