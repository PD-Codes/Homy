// Discord Bot widget — uses shared renderer from /static/js/discord_widget.js
if (window.DiscordWidgetModule && window.WidgetRegistry) {
    window.WidgetRegistry.register('discord_bot', window.DiscordWidgetModule);
}
