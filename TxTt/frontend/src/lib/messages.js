import { supabase } from './supabase';

// 1. CHAT- & MELDINGSFUNKSJONER
export async function getMessages(conversationId, limit = 50) {
  if (!conversationId || conversationId === 'undefined') {
    return [];
  }
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching messages:', err);
    return [];
  }
}

export async function sendMessage(conversationId, senderId, content) {
  if (!conversationId || conversationId === 'undefined') return null;
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert([{ conversation_id: conversationId, sender_id: senderId, content }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error sending message:', err);
    throw err;
  }
}

// FIKS: Bruker nå din korrekte mappenøkkel 'media' i stedet for 'chat-media'
export async function sendImageMessage(conversationId, senderId, file) {
  if (!conversationId || conversationId === 'undefined') return null;
  try {
    const fileExt = file.name.split('.').pop();
    const sanitizedOriginalName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
    const fileName = `${Math.random()}_${sanitizedOriginalName}`;
    const filePath = `chat/${conversationId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: signData, error: signError } = await supabase.storage
      .from('media')
      .createSignedUrl(filePath, 315360000); 

    if (signError) throw signError;
    const secureUrl = signData.signedUrl;

    const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt.toLowerCase());
    const finalMsgType = isImg ? 'image' : 'file';

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        sender_id: senderId,
        file_url: secureUrl,
        message_type: finalMsgType
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error sending file attachment:', err);
    throw err;
  }
}

// FIKS: Bruker nå din korrekte mappenøkkel 'media' i stedet for 'chat-media'
export async function sendAudioMessage(conversationId, senderId, blob) {
  if (!conversationId || conversationId === 'undefined') return null;
  try {
    const fileName = `${Math.random()}.ogg`;
    const filePath = `chat/${conversationId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, blob, { contentType: 'audio/ogg' });

    if (uploadError) throw uploadError;

    const { data: signData, error: signError } = await supabase.storage
      .from('media')
      .createSignedUrl(filePath, 315360000);

    if (signError) throw signError;

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        sender_id: senderId,
        file_url: signData.signedUrl,
        message_type: 'audio'
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error sending audio:', err);
    throw err;
  }
}

// 2. RETENTION (AUTOMATISK SLETTING)
export async function getRetention(conversationId) {
  if (!conversationId || conversationId === 'undefined') return null;
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('retention_hours')
      .eq('id', conversationId)
      .single();

    if (error) throw error;
    return (data?.retention_hours === 0) ? 0 : (data?.retention_hours || null);
  } catch (err) {
    console.error('Error getting retention:', err);
    return null;
  }
}

export async function setRetention(conversationId, hours) {
  if (!conversationId || conversationId === 'undefined') return false;
  try {
    const { error } = await supabase
      .from('conversations')
      .update({ retention_hours: hours })
      .eq('id', conversationId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error setting retention:', err);
    throw err;
  }
}

// 3. PROFIL-, CONVERSATION- OG BRUKERSØK-FUNKSJONER
export async function getProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching profile:', err);
    return null;
  }
}

export async function updateProfile(userId, updates) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error updating profile:', err);
    throw err;
  }
}

export async function getConversations(userId) {
  try {
    const { data, error } = await supabase
      .from('conversation_members')
      .select(`
        conversation_id,
        conversations (
          id,
          created_at,
          retention_hours
        )
      `)
      .eq('user_id', userId);

    if (error) throw error;
    
    return data?.map((item, index) => {
      if (!item.conversations) return null;
      return {
        ...item.conversations,
        id: item.conversations.id || `fallback-id-${index}`
      };
    }).filter(Boolean) || [];
  } catch (err) {
    console.error('Error fetching conversations:', err);
    return [];
  }
}

export async function searchUsers(searchQuery) {
  try {
    if (!searchQuery || !searchQuery.trim()) return [];
    const query = searchQuery.trim();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
      .limit(10);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error searching users:', err);
    return [];
  }
}

export async function startConversation(currentUserId, targetUserId) {
  try {
    const { data: existingMembers, error: checkError } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUserId);

    if (checkError) throw checkError;

    if (existingMembers && existingMembers.length > 0) {
      const myConversationIds = existingMembers.map(m => m.conversation_id);

      const { data: commonConversations, error: matchError } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', targetUserId)
        .in('conversation_id', myConversationIds);

      if (matchError) throw matchError;

      if (commonConversations && commonConversations.length > 0) {
        return commonConversations[0].conversation_id;
      }
    }

    const { data: newChat, error: chatError } = await supabase
      .from('conversations')
      .insert([{}])
      .select()
      .single();

    if (chatError) throw chatError;
    const conversationId = newChat.id;

    const { error: memberError } = await supabase
      .from('conversation_members')
      .insert([
        { conversation_id: conversationId, user_id: currentUserId },
        { conversation_id: conversationId, user_id: targetUserId }
      ]);

    if (memberError) throw memberError;

    return conversationId;
  } catch (err) {
    console.error('Error start conversation:', err);
    throw err;
  }
}

// 4. PROXY FALLBACK (Sikkerhetsnett)
const fallbackHandlers = {
  get(target, prop) {
    if (prop in target) {
      return target[prop];
    }
    console.warn(`[messages.js Fallback] Appen ba om export '${prop}', som ikke finnes. Returnerer trygg tom-funksjon.`);
    return async () => null;
  }
};
const exportedModule = {
  getMessages, sendMessage, sendImageMessage, sendAudioMessage,
  getRetention, setRetention, getProfile, updateProfile,
  getConversations, searchUsers, startConversation
};
export default new Proxy(exportedModule, fallbackHandlers);