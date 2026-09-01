class ModToolsController < ApplicationController
  before_action :authorize_with_admin

  def index
  end

  def toggle_nnn
    SiteConfig.nnn_enabled = !SiteConfig.nnn_enabled?
    state = SiteConfig.nnn_enabled? ? 'enabled' : 'disabled'

    track :regular, :mod_toggle_nnn, by: current_user.username, enabled: SiteConfig.nnn_enabled?

    redirect_to mod_tools_index_path, notice: "NNN #{state}."
  end

  def invites
    load_invites
  end

  def create_invite
    invite = InviteCode.generate!(generated_by: current_user)
    track :regular, :mod_create_invite, by: current_user.username, invite_id: invite.id
    redirect_to mod_tools_invites_path, notice: 'Invite code generated.'
  end

  def destroy_invite
    invite = InviteCode.find(params[:id])
    invite.destroy!
    track :regular, :mod_destroy_invite, by: current_user.username, invite_id: invite.id
    redirect_to mod_tools_invites_path, notice: 'Invite code deleted.'
  end

  def toggle_invite_only
    SiteConfig.invite_only = !SiteConfig.invite_only?
    state = SiteConfig.invite_only? ? 'enabled' : 'disabled'
    track :regular, :mod_toggle_invite_only, by: current_user.username, enabled: SiteConfig.invite_only?
    redirect_to mod_tools_invites_path, notice: "Invite-only mode #{state}."
  end

  def emoji_links
    load_emoji_links
    @emoji_link_decoration = EmojiLinkDecoration.new
  end

  def user_icons
    load_user_icons
    @user_icon = UserIcon.new
  end

  def wallpaper_clients
    load_wallpaper_clients
    @wallpaper_client = WallpaperClient.new(section: 'clients', device_type: 'desktop')
  end

  def system_analytics
    @metrics = SystemMetrics.snapshot
  end

  def activity_analytics
    now = Time.current
    @activity = {
      online_users: Link.is_online.distinct.count(:user_id),
      online_links: Link.is_online.count,
      users_viewing_links: User.active.where.not(viewing_link_id: nil).count,
      links_with_wallpapers: Link.where.not(post_url: nil).count,
      wallpapers_last_hour: PastLink.where(created_at: (now - 1.hour)..now).count,
      wallpapers_last_day: PastLink.where(created_at: (now - 24.hours)..now).count,
      wallpapers_last_week: PastLink.where(created_at: (now - 7.days)..now).count,
      wallpapers_total: PastLink.count,
      visits_last_day: Ahoy::Visit.where(started_at: (now - 24.hours)..now).count,
      new_users_last_day: User.active.where(created_at: (now - 24.hours)..now).count,
      orgasms_last_day: Nuttracker::Orgasm.where(created_at: (now - 24.hours)..now).count,
      open_reports: Report.where(is_closed: false).count
    }
    @wallpapers_by_hour = PastLink.where(created_at: (now - 24.hours)..now)
                                  .group_by_hour(:created_at, range: (now - 24.hours)..now)
                                  .count
  end

  def create_emoji_link
    decoration = EmojiLinkDecoration.new(emoji_link_params)
    if decoration.save
      track :regular, :mod_create_emoji_link, by: current_user.username, link_id: decoration.link_id, emoji: decoration.emoji
      redirect_to mod_tools_emoji_links_path, notice: 'Emoji link added.'
    else
      load_emoji_links
      @emoji_link_decoration = decoration
      render :emoji_links, status: :unprocessable_entity
    end
  end

  def update_emoji_link
    decoration = EmojiLinkDecoration.find(params[:id])
    if decoration.update(emoji_link_params)
      track :regular, :mod_update_emoji_link, by: current_user.username, link_id: decoration.link_id, emoji: decoration.emoji
      redirect_to mod_tools_emoji_links_path, notice: 'Emoji link updated.'
    else
      redirect_to mod_tools_emoji_links_path, alert: decoration.errors.full_messages.to_sentence
    end
  end

  def destroy_emoji_link
    decoration = EmojiLinkDecoration.find(params[:id])
    link_id = decoration.link_id
    decoration.destroy!
    track :regular, :mod_destroy_emoji_link, by: current_user.username, link_id: link_id
    redirect_to mod_tools_emoji_links_path, notice: 'Emoji link removed.'
  end

  def create_user_icon
    user_icon = UserIcon.new(icon_name: user_icon_params[:icon_name])
    user_icon.user = User.active.find_by('lower(username) = ?', user_icon_params[:username].to_s.strip.downcase)

    if user_icon.save
      track :regular, :mod_create_user_icon, by: current_user.username, user: user_icon.user.username, icon_name: user_icon.icon_name
      redirect_to mod_tools_user_icons_path, notice: 'User icon added.'
    else
      load_user_icons
      @user_icon = user_icon
      @user_icon.username = user_icon_params[:username]
      render :user_icons, status: :unprocessable_entity
    end
  end

  def update_user_icon
    user_icon = UserIcon.find(params[:id])
    if user_icon.update(icon_name: user_icon_params[:icon_name])
      track :regular, :mod_update_user_icon, by: current_user.username, user: user_icon.user.username, icon_name: user_icon.icon_name
      redirect_to mod_tools_user_icons_path, notice: 'User icon updated.'
    else
      redirect_to mod_tools_user_icons_path, alert: user_icon.errors.full_messages.to_sentence
    end
  end

  def destroy_user_icon
    user_icon = UserIcon.find(params[:id])
    username = user_icon.user.username
    user_icon.destroy!
    track :regular, :mod_destroy_user_icon, by: current_user.username, user: username
    redirect_to mod_tools_user_icons_path, notice: 'User icon removed.'
  end

  def create_wallpaper_client
    wallpaper_client = WallpaperClient.new(wallpaper_client_params)
    if wallpaper_client.save
      track :regular, :mod_create_wallpaper_client, by: current_user.username, client: wallpaper_client.name
      redirect_to mod_tools_wallpaper_clients_path, notice: 'Client added.'
    else
      load_wallpaper_clients
      @wallpaper_client = wallpaper_client
      render :wallpaper_clients, status: :unprocessable_entity
    end
  end

  def update_wallpaper_client
    wallpaper_client = WallpaperClient.find(params[:id])
    if wallpaper_client.update(wallpaper_client_params)
      track :regular, :mod_update_wallpaper_client, by: current_user.username, client: wallpaper_client.name
      redirect_to mod_tools_wallpaper_clients_path, notice: 'Client updated.'
    else
      redirect_to mod_tools_wallpaper_clients_path, alert: wallpaper_client.errors.full_messages.to_sentence
    end
  end

  def destroy_wallpaper_client
    wallpaper_client = WallpaperClient.find(params[:id])
    name = wallpaper_client.name
    wallpaper_client.destroy!
    track :regular, :mod_destroy_wallpaper_client, by: current_user.username, client: name
    redirect_to mod_tools_wallpaper_clients_path, notice: 'Client removed.'
  end

  def move_wallpaper_client_up
    move_wallpaper_client(:move_up!)
  end

  def move_wallpaper_client_down
    move_wallpaper_client(:move_down!)
  end

  def show_password_reset
  end

  def update_password_reset
    email = params.permit(:email)['email']

    if !email || email.length < 2
      return redirect_to mod_tools_passwords_index_path(fail: 'Email segment too short. Ideally at least 6 letters. They need to provide more of their email.', email:)
    end

    # Prepared statement, rails escapes and wraps template var here.
    matches = User.active.where('lower(email) LIKE ?', "%#{email.downcase}%").all if params['commit'] == 'Try to generate a reset link (case insensitive)'
    matches = User.active.where('email LIKE ?', "%#{email}%").all if params['commit'] == 'Try to generate a reset link (case sensitive)'

    if matches.length > 1
      if matches.length == 2 && (matches[0].email.downcase === matches[1].email.downcase)
        return redirect_to mod_tools_passwords_index_path(fail: "Found 2 accounts only differing by capitalization, #{matches[0].email} and #{matches[1].email}. Use case sensitive search.", email:)
      else
        return redirect_to mod_tools_passwords_index_path(fail: 'Matches more than 1 account, can they be more specific?', email:)
      end
    end

    if !matches || matches.length == 0
      return redirect_to mod_tools_passwords_index_path(fail: 'Email does not exist in database, did they make a typo?', email:)
    end

    matches[0].password_reset_token = SecureRandom.uuid + '-' + current_user.id.to_s
    matches[0].save

    track :regular, :mod_password_reset, by: current_user.username, for: matches[0].username

    if email.length < 6
      return redirect_to mod_tools_passwords_index_path(link: matches[0].password_reset_token, username: matches[0].username, fail: "Search provided was short. (Only #{email.length} letters!) Are you sure you aren\'t being manipulated? Someone may be able to guess a small portion of an email.", email: matches[0].email)
    end

    redirect_to mod_tools_passwords_index_path(link: matches[0].password_reset_token, username: matches[0].username, email: matches[0].email)
  end

  def show_user
    raw_query = params[:query].presence || params[:email].presence
    if raw_query
      query = raw_query.to_s.strip.downcase
      exact_match = User.where('lower(email) = :query OR lower(username) = :query OR lower(deleted_username) = :query', query:)
      partial_match = User.where('lower(email) LIKE :query OR lower(username) LIKE :query OR lower(deleted_username) LIKE :query', query: "%#{User.sanitize_sql_like(query)}%")
      user = exact_match.first || partial_match.order(:username).first

      render 'show_user', locals: { user:, fail: user ? nil : 'That user does not exist.' }
    end
  end

  def deleted_users
    @deleted_users = User.deleted.order(deleted_at: :desc)
  end

  def assume_user
    user = User.find(params['user'])

    unless user && !user.deleted?
      redirect_to mod_tools_users_index_url, alert: 'Failed to assume that user.'
      return
    end

    log_in_as(user)
  end

  def restore_user
    user = User.deleted.find(params[:user])
    original_username = user.deleted_username
    user.restore_account!
    restored_original = user.username.casecmp?(original_username.to_s)
    notice = restored_original ? 'Account restored.' : 'Account restored, but its original username was unavailable.'
    redirect_to account_lifecycle_return_path(user), notice:
  end

  def purge_user
    user = User.deleted.find(params[:user])
    user.purge!
    redirect_to account_lifecycle_return_path, notice: 'Deleted account was permanently purged.'
  rescue ActiveRecord::RecordNotDestroyed
    redirect_to account_lifecycle_return_path, alert: 'Deleted account could not be purged.'
  end

  def update_user
    begin
      safe_params = params.require(:user).permit(:id, :email, :username, :details, :set_count, :quarantined, :flagged, :is_reporter, :is_cutie, :is_supporter)
      user = User.find(safe_params['id'])

      if user
        user.update_bypassing_username_change_cooldown(safe_params)
        return render turbo_stream: turbo_stream.replace("mod_tools_edit_user_form", partial: 'mod_tools/edit_user_form', locals: { user: })
      end
    rescue
      return render turbo_stream: turbo_stream.replace("mod_tools_edit_user_form", partial: 'mod_tools/edit_user_form', locals: { fail: 'something went wrong' })
    end

    render turbo_stream: turbo_stream.replace("mod_tools_edit_user_form", partial: 'mod_tools/edit_user_form', locals: { fail: 'that user does not exist' })
  end

  def show_quarantine
    @users = User.where(admin: false).order(id: :desc).limit 100
  end

  def update_quarantine
    user = User.find(params['user'])

    unless user
      redirect_to mod_tools_quarantine_index_path, alert: 'Failed to find that user.'
      return
    end

    user.quarantined = user.quarantined ? false : true
    result = user.save

    return redirect_to mod_tools_quarantine_index_path(anchor: helpers.dom_id(user)) unless params["return_to"]
    return redirect_to params["return_to"]
  end

  def update_ipban
    user = User.find(params['user'])

    unless user
      redirect_to mod_tools_quarantine_index_path, alert: 'Failed to find that user.'
      return
    end

    ips = user.ahoy_visits.all.map { |visit| visit.ip }
    ips.each do |ip|
      BannedIp.create(ip_address: ip, banned_by: current_user)
    end

    redirect_to mod_tools_quarantine_index_path(anchor: helpers.dom_id(user)) unless params["return_to"]
    return redirect_to params["return_to"], notice: 'ip banned!'
  end

  def show_recent_events
    @events = Ahoy::Event.where(name: 'regular:update_link_post')
                         .or(Ahoy::Event.where("name like 'nefarious:%'"))
                         .order(id: :desc)
                         .limit 100
  end

  def update_ipban_by_event
    event = Ahoy::Event.find(params['event'])

    unless event
      redirect_to mod_tools_events_index_url, alert: 'Failed to find that event.'
      return
    end

    BannedIp.create(ip_address: event.visit.ip, banned_by: current_user)

    redirect_to mod_tools_events_index_url, notice: "IP banned #{event.visit.ip}"
  end

  private

  def emoji_link_params
    params.require(:emoji_link_decoration).permit(:link_id, :emoji)
  end

  def user_icon_params
    params.require(:user_icon).permit(:username, :icon_name)
  end

  def wallpaper_client_params
    params.require(:wallpaper_client).permit(
      :name, :section, :url, :platform, :deprecated, :match_text, :link_name, :icon_name, :device_type
    )
  end

  def load_emoji_links
    @emoji_link_decorations = EmojiLinkDecoration.order(:link_id)
  end

  def load_user_icons
    @user_icons = UserIcon.includes(:user).joins(:user).merge(User.active).order('users.username')
  end

  def load_wallpaper_clients
    @wallpaper_clients = WallpaperClient.ordered
  end

  def load_invites
    @invite_codes = InviteCode.includes(:generated_by, :redeemed_by)
                              .order(Arel.sql('redeemed_at IS NOT NULL ASC'), created_at: :desc)
  end

  def move_wallpaper_client(direction)
    wallpaper_client = WallpaperClient.find(params[:id])
    wallpaper_client.public_send(direction)
    redirect_to mod_tools_wallpaper_clients_path(anchor: helpers.dom_id(wallpaper_client))
  end

  def account_lifecycle_return_path(user = nil)
    return mod_tools_users_deleted_path if params[:return_to] == 'deleted_accounts'
    return mod_tools_users_index_path(email: user.email) if user

    mod_tools_users_index_path
  end

end
