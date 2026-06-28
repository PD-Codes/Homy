/**
 * Shared renderer for discord + discord_bot integration widgets.
 */
(function () {
    'use strict';

    const DiscordWidgetModule = {
        _t(key, fallback, params) {
            if (!window.i18n) return fallback;
            const value = window.i18n.translate(key, params);
            return value === key ? fallback : value;
        },

        _apiPath(widgetData) {
            const t = widgetData?.widget_type || widgetData?.type || 'discord';
            return t === 'discord_bot' ? '/api/discord-bot/widget' : '/api/discord/widget';
        },

        _esc(text) {
            return String(text ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        },

        _statusClass(status) {
            const st = (status || 'online').toLowerCase();
            if (st === 'idle' || st === 'away') return 'idle';
            if (st === 'dnd') return 'dnd';
            if (st === 'offline') return 'offline';
            return 'online';
        },

        _roleSuffix(m, data) {
            return data.show_role_name && m.role ? ` (${this._esc(m.role)})` : '';
        },

        _roleColorStyle(m, data) {
            return data.show_role_colors && m.role_color ? `color:${m.role_color}` : '';
        },

        _createVoiceUserChip(m, data) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'discord-voice-user-chip';
            chip.title = m.username || '';

            const avatarWrap = document.createElement('span');
            avatarWrap.className = 'discord-voice-chip-avatar-wrap';
            const img = document.createElement('img');
            img.src = m.avatar_url || '/static/img/fallback-avatar.png';
            img.alt = '';
            img.className = 'discord-voice-chip-avatar';
            img.onerror = function onAvatarErr() {
                this.src = '/static/img/fallback-avatar.png';
                this.onerror = null;
            };
            const dot = document.createElement('span');
            dot.className = `discord-status-dot ${this._statusClass(m.status)}`;
            avatarWrap.appendChild(img);
            avatarWrap.appendChild(dot);

            const name = document.createElement('span');
            name.className = 'discord-voice-chip-name';
            name.style.cssText = this._roleColorStyle(m, data);
            name.textContent = `${m.username || '?'}${this._roleSuffix(m, data)}`;

            chip.appendChild(avatarWrap);
            chip.appendChild(name);
            return chip;
        },

        _renderVoiceByChannel(voiceMembers, data) {
            const container = document.createElement('div');
            container.className = 'discord-voice-channels';
            const byChannel = new Map();
            const channelOrder = [];

            voiceMembers.forEach((m) => {
                const key = m.voice_channel_name || m.voice_channel_id || '?';
                if (!byChannel.has(key)) {
                    byChannel.set(key, []);
                    channelOrder.push(key);
                }
                byChannel.get(key).push(m);
            });

            channelOrder.forEach((chName) => {
                const block = document.createElement('div');
                block.className = 'discord-voice-channel-block';

                const heading = document.createElement('div');
                heading.className = 'discord-voice-channel-heading';
                heading.textContent = `🔊 ${chName}`;

                const divider = document.createElement('hr');
                divider.className = 'discord-voice-channel-divider';

                const users = document.createElement('div');
                users.className = 'discord-voice-users';
                byChannel.get(chName).forEach((m) => {
                    users.appendChild(this._createVoiceUserChip(m, data));
                });

                block.appendChild(heading);
                block.appendChild(divider);
                block.appendChild(users);
                container.appendChild(block);
            });

            return container;
        },

        _renderMemberItem(m, data) {
            const statusClass = this._statusClass(m.status);
            const roleSuffix = this._roleSuffix(m, data);
            const roleColorStyle = this._roleColorStyle(m, data);
            const voiceHint = m.in_voice && m.voice_channel_name
                ? `<div class="discord-voice-hint muted-text">🔊 ${this._esc(m.voice_channel_name)}</div>`
                : '';
            return `
                <div class="discord-member-item">
                    <div class="discord-avatar-wrapper">
                        <img src="${this._esc(m.avatar_url)}" class="discord-avatar" alt=""
                            onerror="this.src='/static/img/fallback-avatar.png'; this.onerror=null;">
                        <span class="discord-status-dot ${statusClass}"></span>
                    </div>
                    <div class="discord-member-details">
                        <div class="discord-username" style="${roleColorStyle}">${this._esc(m.username)}${roleSuffix}</div>
                        ${m.game ? `<div class="discord-game muted-text">${this._t('discord_playing', 'Playing')} <strong>${this._esc(m.game)}</strong></div>` : ''}
                        ${voiceHint}
                    </div>
                </div>`;
        },

        async render(container, widgetData, config) {
            container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

            try {
                const data = await API.request(`${this._apiPath(widgetData)}?widget_id=${widgetData.id}`);
                container.innerHTML = '';

                if (!data.configured) {
                    container.innerHTML = `
                        <div class="discord-setup-hint text-center muted-text" style="padding:20px;">
                            <i data-lucide="message-square-off" style="width:32px;height:32px;margin-bottom:8px;"></i>
                            <p>${this._esc(data.message)}</p>
                        </div>`;
                    window.refreshLucideIcons?.(container);
                    return;
                }

                if (!data.online) {
                    const msgKey = data.message_key || '';
                    const msg = msgKey
                        ? this._t(msgKey, data.message || '')
                        : (data.message || '');
                    const setupKey = data.setup_hint_key || 'discord_setup_widget';
                    container.innerHTML = `
                        <div class="discord-setup-hint text-center" style="padding:20px;">
                            <i data-lucide="alert-triangle" class="text-warning" style="width:32px;height:32px;margin-bottom:8px;"></i>
                            <p>${this._esc(msg)}</p>
                            <p class="muted-text" style="font-size:0.8rem;margin-top:10px;">${this._t(setupKey, '')}</p>
                        </div>`;
                    window.refreshLucideIcons?.(container);
                    return;
                }

                const card = document.createElement('div');
                card.className = 'discord-widget-container';

                const header = document.createElement('div');
                header.className = 'discord-status-header';
                const showCount = data.show_online_count !== false;
                const showJoin = data.show_join_button !== false && data.instant_invite;
                header.innerHTML = `
                    <div class="discord-server-info">
                        ${data.show_logo !== false ? '<div class="discord-logo"><i data-lucide="message-circle"></i></div>' : ''}
                        <div>
                            <div class="discord-name">${this._esc(data.name)}</div>
                            ${showCount ? `<div class="discord-online-count">${data.presence_count} ${this._t('discord_online', 'online')}</div>` : ''}
                            ${data.bot_mode && !data.widget_enabled ? `<div class="discord-widget-badge muted-text">${this._t('discord_bot_no_widget', 'Widget API off — bot mode')}</div>` : ''}
                        </div>
                    </div>
                    ${showJoin ? `
                        <a href="${this._esc(data.instant_invite)}" target="_blank" rel="noopener" class="btn btn-outline btn-discord-join">
                            <i data-lucide="external-link"></i> ${this._t('discord_join', 'Join')}
                        </a>` : ''}`;
                card.appendChild(header);

                if (data.voice_error) {
                    const err = document.createElement('div');
                    err.className = 'discord-error-banner text-warning';
                    err.style.cssText = 'padding: 8px 12px; font-size: 0.75rem; border-radius: var(--radius-sm); border: 1px solid rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.05); display: flex; align-items: flex-start; gap: 8px; margin: 8px 0 8px; line-height: 1.4;';
                    err.innerHTML = `<i data-lucide="alert-triangle" style="width:14px;height:14px;flex-shrink:0;margin-top:2px;"></i><span>${this._esc(data.voice_error)}</span>`;
                    card.appendChild(err);
                }

                if (data.show_channels && data.channels?.length) {
                    const chWrap = document.createElement('div');
                    chWrap.className = 'discord-channels';
                    const title = document.createElement('div');
                    title.className = 'discord-section-title';
                    title.textContent = this._t('discord_channels', 'Channels');
                    chWrap.appendChild(title);
                    const list = document.createElement('ul');
                    list.className = 'discord-channel-list';
                    const max = 80;
                    data.channels.slice(0, max).forEach((c) => {
                        const li = document.createElement('li');
                        li.className = 'discord-channel-list-item';
                        const t = c.type;
                        const prefix = (t === 2 || t === 13) ? '🔊 ' : '#';
                        li.textContent = `${prefix}${c.name}`;
                        list.appendChild(li);
                    });
                    chWrap.appendChild(list);
                    if (data.channels.length > max) {
                        const more = document.createElement('p');
                        more.className = 'muted-text discord-channel-more';
                        more.textContent = this._t('discord_channels_more', '+{count} more', {
                            count: data.channels.length - max,
                        });
                        chWrap.appendChild(more);
                    }
                    card.appendChild(chWrap);
                }

                if (data.show_voice_members && data.bot_mode) {
                    const voiceSection = document.createElement('div');
                    voiceSection.className = 'discord-voice-section';
                    const title = document.createElement('div');
                    title.className = 'discord-section-title';
                    title.textContent = this._t('discord_voice_title', 'In voice');
                    voiceSection.appendChild(title);

                    const voiceMembers = data.voice_members || [];
                    if (voiceMembers.length) {
                        voiceSection.appendChild(this._renderVoiceByChannel(voiceMembers, data));
                    } else {
                        const empty = document.createElement('p');
                        empty.className = 'muted-text text-center';
                        empty.style.padding = '8px';
                        empty.textContent = this._t('discord_voice_empty', 'Nobody in voice.');
                        voiceSection.appendChild(empty);
                    }
                    card.appendChild(voiceSection);
                }

                if (data.show_online_members !== false) {
                    const membersSection = document.createElement('div');
                    membersSection.className = 'discord-members-section';
                    const title = document.createElement('div');
                    title.className = 'discord-section-title';
                    title.textContent = this._t('discord_members_online', 'Online');
                    membersSection.appendChild(title);

                    const membersList = document.createElement('div');
                    membersList.className = 'discord-members-list';
                    const members = data.members || [];
                    if (members.length) {
                        membersList.innerHTML = members.map((m) => this._renderMemberItem(m, data)).join('');
                    } else {
                        membersList.innerHTML = `<div class="muted-text text-center" style="padding:10px;">${this._t('discord_no_members', 'No users online.')}</div>`;
                    }
                    membersSection.appendChild(membersList);
                    card.appendChild(membersSection);
                }

                container.appendChild(card);
                window.refreshLucideIcons?.(container);
            } catch (err) {
                container.innerHTML = `<div class="widget-error"><i data-lucide="alert-circle"></i><span>${this._esc(err.message)}</span></div>`;
                window.refreshLucideIcons?.(container);
            }
        },
    };

    window.DiscordWidgetModule = DiscordWidgetModule;
    if (window.WidgetRegistry) {
        window.WidgetRegistry.register('discord', DiscordWidgetModule);
        window.WidgetRegistry.register('discord_bot', DiscordWidgetModule);
    }
})();
