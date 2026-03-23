import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { GiftedChat, IMessage, User, InputToolbar, Bubble, Send } from 'react-native-gifted-chat';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppWrapper } from '@/components/app-wrapper';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { InitialsAvatar } from '@/utils/avatar-utils';
import { useDoctorPhotos } from '@/hooks/use-doctor-photo';
import { getFastenPractitioners, Provider as FastenProvider } from '@/services/fasten-health';
import { 
  initializeAbly, 
  subscribeToChannel, 
  unsubscribeFromChannel, 
  publishMessage,
  enterPresence,
  leavePresence,
} from '@/services/ably-chat';

function ChatInputToolbar({ 
  props, 
  colors, 
  getScaledFontSize,
  insets 
}: { 
  props: any; 
  colors: any; 
  getScaledFontSize: (size: number) => number;
  insets: { bottom: number };
}) {
  return (
    <InputToolbar
      {...props}
      containerStyle={[
        styles.inputToolbar,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.text + '20',
          paddingTop: getScaledFontSize(4),
          paddingBottom: 0,
          marginBottom: 0,
        }
      ]}
      textInputStyle={[
        styles.textInput,
        {
          color: colors.text,
          fontSize: getScaledFontSize(16),
          minHeight: getScaledFontSize(44),
          maxHeight: getScaledFontSize(100),
          paddingTop: getScaledFontSize(12),
          paddingBottom: getScaledFontSize(12),
        }
      ]}
      placeholderTextColor={colors.text + '60'}
    />
  );
}

export default function InboxScreen() {
  const { getScaledFontSize, settings, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const [providers, setProviders] = useState<FastenProvider[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<FastenProvider | null>(null);
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAblyConfigured, setIsAblyConfigured] = useState(true);
  const [currentChannel, setCurrentChannel] = useState<string | null>(null);

  // Generate a unique user ID for this session
  // In production, use actual user ID from auth
  const currentUser: User = React.useMemo(() => ({
    _id: `user-${Date.now()}`,
    name: 'You', // In production, get from user profile
  }), []);

  // Load doctor photos for all providers
  const providerIds = providers.map(p => p.id);
  const doctorPhotos = useDoctorPhotos(providerIds);

  // Load providers
  useEffect(() => {
    const loadProviders = async () => {
      setIsLoadingProviders(true);
      try {
        const loadedProviders = await getFastenPractitioners();
        setProviders(loadedProviders);
      } catch (error) {
        console.error('Error loading providers:', error);
      } finally {
        setIsLoadingProviders(false);
      }
    };

    loadProviders();
  }, []);

  // Initialize Ably and set up chat when a provider is selected
  useEffect(() => {
    if (!selectedProvider) {
      // Clean up previous channel if switching providers
      if (currentChannel) {
        unsubscribeFromChannel(currentChannel);
        leavePresence(currentChannel);
        setCurrentChannel(null);
        setMessages([]);
      }
      return;
    }

    const channelName = `chat-${currentUser._id}-${selectedProvider.id}`;
    setCurrentChannel(channelName);

    // Initialize Ably
    const client = initializeAbly();
    
    if (!client) {
      console.warn('Ably not initialized. Chat will work in offline mode only.');
      setIsConnected(false);
      setIsAblyConfigured(false);
      return;
    }
    
    setIsAblyConfigured(true);
    
    client.connection.on('connected', () => {
      console.log('Ably connected');
      setIsConnected(true);
      
      // Enter presence
      enterPresence(channelName, { userId: currentUser._id, name: currentUser.name });
    });

    client.connection.on('disconnected', () => {
      console.log('Ably disconnected');
      setIsConnected(false);
    });

    client.connection.on('failed', () => {
      console.error('Ably connection failed');
      setIsConnected(false);
    });

    // Subscribe to channel messages
    const channel = subscribeToChannel(channelName, (message) => {
      if (message.name === 'message' && message.data) {
        // Filter out messages from current user to prevent duplicates
        // (we already add them optimistically when sending)
        if (message.data.userId === currentUser._id) {
          return;
        }
        
        const newMessage: IMessage = {
          _id: message.id || `${Date.now()}-${Math.random()}`,
          text: message.data.text || '',
          createdAt: new Date(message.timestamp || Date.now()),
          user: {
            _id: message.data.userId || 'unknown',
            name: message.data.userName || 'Unknown',
          },
        };
        
        setMessages((previousMessages) => 
          GiftedChat.append(previousMessages, [newMessage])
        );
      }
    });

    // Cleanup on unmount or provider change
    return () => {
      if (channel) {
        unsubscribeFromChannel(channelName);
      }
      leavePresence(channelName);
    };
  }, [selectedProvider, currentUser._id, currentUser.name]);

  const onSend = useCallback(async (newMessages: IMessage[] = []) => {
    if (newMessages.length === 0 || !currentChannel) return;

    // Add messages to local state immediately for optimistic UI
    setMessages((previousMessages) => 
      GiftedChat.append(previousMessages, newMessages)
    );

    // Publish to Ably
    for (const message of newMessages) {
      try {
        await publishMessage(currentChannel, {
          text: message.text,
          userId: currentUser._id,
          userName: currentUser.name,
          timestamp: message.createdAt instanceof Date ? message.createdAt.getTime() : message.createdAt,
        });
      } catch (error) {
        console.error('Error publishing message:', error);
      }
    }
  }, [currentUser, currentChannel]);

  const handleProviderSelect = (provider: FastenProvider) => {
    setSelectedProvider(provider);
    setMessages([]); // Clear messages when switching providers
  };

  const handleBackToList = () => {
    setSelectedProvider(null);
    setMessages([]);
  };

  const renderInputToolbar = useCallback((props: any) => {
    return (
      <ChatInputToolbar 
        props={props}
        colors={colors}
        getScaledFontSize={getScaledFontSize}
        insets={insets}
      />
    );
  }, [colors, getScaledFontSize, insets]);

  const renderBubble = (props: any) => {
    return (
      <Bubble
        {...props}
        wrapperStyle={{
          right: {
            backgroundColor: colors.tint || '#008080',
            marginBottom: getScaledFontSize(4),
          },
          left: {
            backgroundColor: colors.text + '15',
            marginBottom: getScaledFontSize(4),
          },
        }}
        textStyle={{
          right: {
            color: '#fff',
            fontSize: getScaledFontSize(16),
          },
          left: {
            color: colors.text,
            fontSize: getScaledFontSize(16),
          },
        }}
        timeTextStyle={{
          right: {
            color: '#fff' + '80',
            fontSize: getScaledFontSize(12),
          },
          left: {
            color: colors.text + '80',
            fontSize: getScaledFontSize(12),
          },
        }}
      />
    );
  };

  const renderSend = (props: any) => {
    return (
      <Send
        {...props}
        containerStyle={styles.sendContainer}
        textStyle={[
          styles.sendText,
          {
            color: colors.tint || '#008080',
            fontSize: getScaledFontSize(16),
            fontWeight: getScaledFontWeight(600) as any,
          }
        ]}
      />
    );
  };

  // Provider List View
  if (!selectedProvider) {
    return (
      <AppWrapper>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          

          {!isAblyConfigured && (
            <View style={[styles.configBanner, { backgroundColor: colors.text + '10', borderBottomColor: colors.text + '20' }]}>
              <Text style={[styles.configBannerText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                Ably API key not configured. Set EXPO_PUBLIC_ABLY_API_KEY in your .env file to enable real-time chat.
              </Text>
            </View>
          )}

          {isLoadingProviders ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.tint || '#008080'} />
              <Text style={[styles.loadingText, { color: colors.text + '80', fontSize: getScaledFontSize(14) }]}>
                Loading providers...
              </Text>
            </View>
          ) : providers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.text + '80', fontSize: getScaledFontSize(16) }]}>
                No providers found
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.providerList} contentContainerStyle={styles.providerListContent}>
              {providers.map((provider) => (
                <TouchableOpacity
                  key={provider.id}
                  style={[
                    styles.providerItem,
                    {
                      borderBottomColor: colors.text + '20',
                      backgroundColor: colors.background,
                    }
                  ]}
                  onPress={() => handleProviderSelect(provider)}
                  activeOpacity={0.7}
                >
                  <InitialsAvatar
                    name={provider.name}
                    size={getScaledFontSize(56)}
                    style={styles.providerAvatar}
                    image={doctorPhotos.get(provider.id) ? { uri: doctorPhotos.get(provider.id)! } : undefined}
                  />
                  <View style={[styles.providerInfo, { marginLeft: getScaledFontSize(16) }]}>
                    <Text style={[
                      styles.providerName,
                      {
                        fontSize: getScaledFontSize(16),
                        fontWeight: getScaledFontWeight(600) as any,
                        color: colors.text,
                        marginBottom: getScaledFontSize(4),
                      }
                    ]}>
                      {provider.name}
                    </Text>
                    <Text style={[
                      styles.providerDetails,
                      {
                        fontSize: getScaledFontSize(14),
                        fontWeight: getScaledFontWeight(400) as any,
                        color: colors.text + '80',
                      }
                    ]}>
                      {provider.qualifications || provider.specialty || 'Healthcare Provider'}
                    </Text>
                  </View>
                  <IconSymbol 
                    name="chevron.right" 
                    size={getScaledFontSize(20)} 
                    color={colors.text + '60'} 
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </AppWrapper>
    );
  }

  // Chat View
  return (
    <AppWrapper>
      <KeyboardProvider>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* Chat Header - Fixed at top */}
          <View style={[
            styles.chatHeader, 
            { 
              borderBottomColor: colors.text + '20', 
              backgroundColor: colors.background,
            }
          ]}>
            <TouchableOpacity
              onPress={handleBackToList}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <IconSymbol 
                name="chevron.right" 
                size={getScaledFontSize(24)} 
                color={colors.text} 
                style={{ transform: [{ rotate: '180deg' }] }}
              />
            </TouchableOpacity>
            <InitialsAvatar
              name={selectedProvider.name}
              size={getScaledFontSize(40)}
              style={styles.chatHeaderAvatar}
              image={doctorPhotos.get(selectedProvider.id) ? { uri: doctorPhotos.get(selectedProvider.id)! } : undefined}
            />
            <View style={styles.chatHeaderInfo}>
              <Text style={[
                styles.chatHeaderName,
                {
                  fontSize: getScaledFontSize(18),
                  fontWeight: getScaledFontWeight(600) as any,
                  color: colors.text,
                }
              ]}>
                {selectedProvider.name}
              </Text>
              <View style={styles.statusContainer}>
                {isConnected && (
                  <View style={[styles.statusIndicator, { backgroundColor: '#4CAF50' }]} />
                )}
                <Text style={[
                  styles.chatHeaderSubtitle,
                  {
                    fontSize: getScaledFontSize(12),
                    fontWeight: getScaledFontWeight(400) as any,
                    color: colors.text + '80',
                    marginLeft: isConnected ? getScaledFontSize(6) : 0,
                  }
                ]}>
                  {isConnected ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
          </View>

          {!isAblyConfigured && (
            <View style={[styles.configBanner, { backgroundColor: colors.text + '10', borderBottomColor: colors.text + '20' }]}>
              <Text style={[styles.configBannerText, { color: colors.text, fontSize: getScaledFontSize(14) }]}>
                Ably API key not configured. Set EXPO_PUBLIC_ABLY_API_KEY in your .env file to enable real-time chat.
              </Text>
            </View>
          )}

          {/* Chat Container - Takes remaining space */}
          <View style={styles.chatWrapper}>
            <GiftedChat
              messages={messages}
              onSend={onSend}
              user={currentUser}
              renderInputToolbar={renderInputToolbar}
              renderBubble={renderBubble}
              renderSend={renderSend}
              placeholder="Type a message..."
              alwaysShowSend
              minInputToolbarHeight={56}
              maxInputLength={1000}
              keyboardShouldPersistTaps="never"
              bottomOffset={insets.bottom}
            />
          </View>
        </View>
      </KeyboardProvider>
    </AppWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headerTitle: {
    marginBottom: 2,
  },
  headerSubtitle: {
    marginTop: 2,
  },
  configBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  configBannerText: {
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    textAlign: 'center',
  },
  providerList: {
    flex: 1,
  },
  providerListContent: {
    paddingBottom: 16,
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  providerAvatar: {
    backgroundColor: 'transparent',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    // Styles applied inline
  },
  providerDetails: {
    // Styles applied inline
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  chatHeaderAvatar: {
    marginRight: 12,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatHeaderName: {
    marginBottom: 2,
  },
  chatHeaderSubtitle: {
    // Styles applied inline
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chatWrapper: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
  },
  inputToolbar: {
    borderTopWidth: 1,
    paddingHorizontal: 8,
  },
  textInput: {
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    marginHorizontal: 4,
    backgroundColor: 'transparent',
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  sendText: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
