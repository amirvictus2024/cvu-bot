const TelegramBot = require('node-telegram-bot-api');

// Replace 'YOUR_BOT_TOKEN' with your actual bot token from @BotFather
const token = '8198810959:AAEb7EshCLmRAf6YhBEFaIgIF_qU3UC3SjM';
const bot = new TelegramBot(token, {
  polling: {
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

// Handle polling errors
bot.on('polling_error', (error) => {
  if (error.code === 'ETELEGRAM' && error.message.includes('terminated by other getUpdates')) {
    console.log('⚠️ Another bot instance is running. Stopping this instance...');
    bot.stopPolling();
    process.exit(1);
  } else {
    console.error('Polling error:', error);
  }
});

const SUPER_ADMIN = '6712954701';
const botAdmins = new Set([SUPER_ADMIN]);
const mutedUsers = new Map();
const groupSettings = new Map(); // Store group-specific settings

// Helper function to validate username format
const isValidUsername = (username) => {
  return username.startsWith('@') && username.length > 1;
};

// Handle /start command
bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id.toString();
  const userName = msg.from.first_name;

  if (msg.chat.type === 'private') {
    botAdmins.add(userId);
    await bot.sendMessage(msg.chat.id, 
      `✅ سلام ${userName} عزیز!\n\n` +
      `🎉 شما به عنوان ادمین ربات ثبت شدید.\n` +
      `➡️ کافیه ربات رو به گروه خودتون اضافه کنید و از امکانات اون استفاده کنید.\n\n` +
      `📝 راهنما:\n` +
      `1. ربات رو به گروه اضافه کنید\n` +
      `2. ربات رو ادمین گروه کنید\n` +
      `3. تمام! ربات به صورت خودکار از اعضای جدید تایید میگیره\n\n` +
      `📋 دستورات فارسی:\n` +
      `حذف سکوت [آیدی کاربر] - حذف محدودیت کاربر\n` +
      `\n📋 English Commands:\n` +
      `/unmute or !unmute [USER_ID] - Remove user restriction\n` +
      `/setsupport @username - Change support contact\n\n` +
      (userId === SUPER_ADMIN ? 
        `⚠️ برای تغییر آیدی پشتیبانی، کافیست در کد ربات لینک زیر را تغییر دهید:\n` +
        `https://t.me/xping_official` : 
        `📞 برای پشتیبانی با @xping_official در ارتباط باشید`)
    );

    // Notify super admin
    if (userId !== SUPER_ADMIN) {
      await bot.sendMessage(SUPER_ADMIN, 
        `👤 ادمین جدید اضافه شد:\n` +
        `نام: ${userName}\n` +
        `آیدی: ${userId}`
      );
    }
  }
});

// Handle when bot is added to a group
bot.on('new_chat_members', async (msg) => {
  const newMembers = msg.new_chat_members;
  const botUser = await bot.getMe();
  
  // Check if the bot itself was added
  if (newMembers.some(member => member.id === botUser.id)) {
    const chatId = msg.chat.id;
    
    try {
      // Get chat administrators first
      const admins = await bot.getChatAdministrators(chatId);
      const owner = admins.find(admin => admin.status === 'creator');
      
      // Check bot permissions
      const botMember = await bot.getChatMember(chatId, botUser.id);
      if (!botMember.can_restrict_members) {
        await bot.sendMessage(chatId, 
          "⚠️ لطفاً دسترسی محدود کردن کاربران را به من بدهید تا بتوانم کار کنم.");
      }

      // Send setup message regardless of permissions
      if (owner) {
        await bot.sendMessage(chatId,
          `👋 سلام!\n` +
          `✅ من شناسایی شدم. لطفاً برای تنظیم ربات، لینک پشتیبانی را به صورت زیر ارسال کنید:\n\n` +
          `https://t.me/yourid\n\n` +
          `⚠️ فقط ادمین اصلی (${owner.user.first_name}) می‌تواند این کار را انجام دهد.`
        );
        
        // Store owner ID for verification
        groupSettings.set(chatId, { 
          ownerId: owner.user.id,
          supportId: 'xping_official'
        });
      }
      return;
    } catch (error) {
      console.error('Error in bot added handler:', error);
    }
    return;
  }

  // Handle new regular members
  const chatId = msg.chat.id;
  
  // Process each new member
  for (const newMember of newMembers) {
    // Skip if it's the bot itself
    if (newMember.id === botUser.id) continue;
    
    const userId = newMember.id;

  // Mute the new user
  try {
    await bot.restrictChatMember(chatId, userId, {
      can_send_messages: false,
      can_send_media_messages: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false
    });

    mutedUsers.set(userId, false);

    // Send verification message with inline keyboard
    const groupSetting = groupSettings.get(chatId) || { supportId: 'xping_official' };
    const supportUrl = `https://t.me/${groupSetting.supportId.replace('@', '')}`;

    const verifyMessage = await bot.sendMessage(chatId, 
      `👋 سلام ${msg.new_chat_members[0].first_name}!\n`+
      `🔒 لطفا برای دسترسی به گروه، دکمه زیر را فشار دهید.\n`+
      `⏰ زمان تایید: 5 دقیقه\n\n`+
      `📞 در صورت نیاز با پشتیبانی تماس بگیرید.`, {
      reply_markup: {
        inline_keyboard: [
          [{
            text: '🔵 تایید حساب کاربری',
            callback_data: `verify_${userId}`
          }],
          [{
            text: '💬 پشتیبانی',
            url: supportUrl
          }]
        ]
      }
    });

    // Remove verification message after 5 minutes
    setTimeout(() => {
      bot.deleteMessage(chatId, verifyMessage.message_id).catch(() => {});
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error('Error in new member handling:', error);
  }
  }
});

// Handle button clicks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data.startsWith('verify_')) {
    const targetUserId = parseInt(data.split('_')[1]);

    if (userId === targetUserId) {
      try {
        // Unmute user
        await bot.restrictChatMember(chatId, userId, {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true
        });

        mutedUsers.delete(userId);

        await bot.answerCallbackQuery(query.id, {
          text: '✅ حساب کاربری شما با موفقیت تایید شد!'
        });

        await bot.deleteMessage(chatId, query.message.message_id);

        const successMsg = await bot.sendMessage(chatId, 
          `✨ کاربر ${query.from.first_name} با موفقیت تایید شد!\n`+
          `🎉 به گروه ما خوش آمدید!`);
          
        // Delete success message after 1 minute
        setTimeout(() => {
          bot.deleteMessage(chatId, successMsg.message_id).catch(() => {});
        }, 60 * 1000);
      } catch (error) {
        console.error('Error in verification:', error);
      }
    }
  }
});

// Handle unmute commands
bot.onText(/^[/!]unmute (.+)|حذف سکوت (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = match[1] || match[2];

  try {
    const chatMember = await bot.getChatMember(chatId, msg.from.id);
    if (['creator', 'administrator'].includes(chatMember.status)) {
      await bot.restrictChatMember(chatId, userId, {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true
      });

      mutedUsers.delete(parseInt(userId));

      await bot.sendMessage(chatId, 
        `✅ محدودیت کاربر ${userId} با موفقیت برداشته شد!\n`+
        `👤 توسط ادمین: ${msg.from.first_name}`);
    }
  } catch (error) {
    console.error('Error in unmute command:', error);
  }
});


// Handle support link messages
bot.onText(/https:\/\/t\.me\/(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const senderId = msg.from.id;
  const username = match[1];
  
  const groupSetting = groupSettings.get(chatId);
  if (!groupSetting || groupSetting.ownerId !== senderId) {
    return;
  }

  groupSettings.set(chatId, {
    ...groupSetting,
    supportId: username
  });

  await bot.sendMessage(chatId,
    `✅ لینک پشتیبانی با موفقیت تنظیم شد!\n` +
    `📱 پشتیبانی: https://t.me/${username}`
  );
});

// Handle old support ID change command
bot.onText(/\/setsupport (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const newSupportId = match[1];

  try {
    // Check if in group
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
      return bot.sendMessage(chatId, '❌ این دستور فقط در گروه قابل استفاده است.');
    }

    // Check if sender is group admin
    const chatMember = await bot.getChatMember(chatId, msg.from.id);
    if (!['creator', 'administrator'].includes(chatMember.status)) {
      return bot.sendMessage(chatId, '❌ فقط ادمین‌های گروه می‌توانند آیدی پشتیبانی را تغییر دهند.');
    }

    // Validate username format
    if (!isValidUsername(newSupportId)) {
      return bot.sendMessage(chatId, '❌ فرمت نادرست. لطفا یوزرنیم را با @ وارد کنید.');
    }

    // Save the new support ID for this group
    groupSettings.set(chatId, { supportId: newSupportId });

    await bot.sendMessage(chatId, 
      `✅ آیدی پشتیبانی گروه با موفقیت تغییر کرد!\n` +
      `📱 پشتیبانی جدید: ${newSupportId}`
    );
  } catch (error) {
    console.error('Error in setsupport command:', error);
  }
});

console.log('Bot start has done ✅✅');
