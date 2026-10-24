module NodeModerationActions
  extend ActiveSupport::Concern
  included do
    rescue_from NodeModerationBackend::Unavailable do
      render plain: 'Moderation is temporarily unavailable. Please try again.', status: :service_unavailable
    end
    rescue_from NodeModerationBackend::Rejected do |error|
      if error.status == 422 && %w[mod_tools reports].include?(controller_name) && (request.post? || request.patch?)
        if controller_name == 'mod_tools' && action_name == 'update_password_reset'
          @moderation_reset = { 'warning' => error.message }
          render :show_password_reset, status: :unprocessable_entity
        elsif controller_name == 'mod_tools' && action_name == 'update_user' && @moderation_edit_user
          @moderation_edit_user.errors.add(:base, error.message)
          render turbo_stream: turbo_stream.replace('mod_tools_edit_user_form', partial: 'mod_tools/edit_user_form',
            locals: { user: @moderation_edit_user }), status: :unprocessable_entity
        else
          redirect_to moderation_error_path, alert: error.message, status: :see_other
        end
      else
        render plain: error.message, status: error.status
      end
    end
  end

  private

  def moderation(operation, **input)
    response.set_header('X-Walltaker-Moderation', 'node')
    response.set_header('Cache-Control', 'no-store')
    NodeModerationBackend.request(operation, { actor_id: current_user&.id,
      surrender_id: browser_surrender_id, request_key: SecureRandom.uuid, **input })
  end

  def moderation_records(result, key, model)
    NodeModerationBackend.records(result, key, model)
  end

  def moderation_list(data, model, page_param: :page)
    [Pagy.new(count: data.fetch('count'), page: data.fetch('page'), items: data.fetch('per'), page_param:),
      moderation_records(data, 'records', model)]
  end

  def moderation_user_document(result)
    return unless result['user']
    return NodeBrowserBackend.hydrate(User, [result.fetch('user')]).first if NodeBrowserBackend.enabled?
    user = User.instantiate(result.fetch('user'))
    profile = result['profile'] && Profile.instantiate(result['profile'])
    user.association(:profile).target = profile
    user.association(:profiles).target = [profile].compact
    user
  end

  def moderation_visit_graph(result)
    moderators = moderation_records(result, 'moderators', User).index_by(&:id)
    bans = moderation_records(result, 'bans', BannedIp)
    bans.each { |ban| ban.association(:banned_by).target = moderators[ban.banned_by_id] }
    moderation_records(result, 'visits', Ahoy::Visit).each do |visit|
      visit.association(:banned_ip).target = bans.find { |ban| ban.ip_address == visit.ip }
    end
  end

  def serve_node_moderation
    return unless NodeModerationBackend.enabled?
    return serve_moderation_reports if controller_name == 'reports'
    if controller_name == 'lizard_tools'
      if action_name == 'index'
        moderation('lizard-index'); render :index
      else
        result = moderation('lizard-browse', mascot: action_name, page: params[:page])
        @moderation_lizard_page = result.fetch('page'); @moderation_lizard_has_more = result.fetch('has_more')
        users = moderation_records(result, 'users', User).index_by(&:id)
        @links = moderation_records(result, 'links', Link).each do |link|
          link.association(:user).target = users.fetch(link.user_id)
        end.group_by { |link| !!link.user.pervert }
        @name = action_name.capitalize
        render :lizard_browse
      end
      return
    end
    case action_name
    when 'index'
      @moderation_dashboard = moderation('dashboard'); render :index
    when 'invites'
      result = moderation('invites', page: params[:page]); @moderation_settings = result.fetch('settings')
      @moderation_pagy, @invite_codes = moderation_list(result.fetch('invites'), InviteCode)
      users = moderation_records(result, 'users', User).index_by(&:id)
      @invite_codes.each do |invite|
        invite.association(:generated_by).target = users[invite.generated_by_id]
        invite.association(:redeemed_by).target = users[invite.redeemed_by_id]
      end
      render :invites
    when 'emoji_links'
      @moderation_pagy, @emoji_link_decorations = moderation_list(moderation('emoji-links', page: params[:page]).fetch('decorations'), EmojiLinkDecoration)
      @emoji_link_decoration = EmojiLinkDecoration.new; render :emoji_links
    when 'user_icons'
      result = moderation('user-icons', page: params[:page]); @moderation_pagy, @user_icons = moderation_list(result.fetch('icons'), UserIcon)
      users = moderation_records(result, 'users', User).index_by(&:id)
      @user_icons.each { |icon| icon.association(:user).target = users.fetch(icon.user_id) }
      @user_icon = UserIcon.new; render :user_icons
    when 'wallpaper_clients'
      @moderation_pagy, @wallpaper_clients = moderation_list(moderation('clients', page: params[:page]).fetch('clients'), WallpaperClient)
      @wallpaper_client = WallpaperClient.new(section: 'clients', device_type: 'desktop'); render :wallpaper_clients
    when 'profile_domains'
      result = moderation('domains', **params.permit(:pending_page, :approved_page, :blocked_page).to_h.symbolize_keys)
      users = moderation_records(result, 'users', User).index_by(&:id)
      %w[pending approved blocked].each do |kind|
        pagy, domains = moderation_list(result.fetch(kind), ProfileDomain, page_param: "#{kind}_page".to_sym)
        domains.each { |domain| domain.association(:reviewed_by).target = users[domain.reviewed_by_id] }
        instance_variable_set("@#{kind}_profile_domains_pagy", pagy); instance_variable_set("@#{kind}_profile_domains", domains)
      end
      render :profile_domains
    when 'system_analytics'
      @metrics = activity_analytics_request('system').deep_symbolize_keys
      @metrics[:captured_at] = Time.iso8601(@metrics.fetch(:captured_at)); render :system_analytics
    when 'activity_analytics'
      result = activity_analytics_request('activity'); @activity = result.fetch('activity').symbolize_keys
      @wallpapers_by_hour = result.fetch('hours').to_h { |row| [row.fetch('hour'), row.fetch('count')] }; render :activity_analytics
    when 'show_user'
      query = params[:query].presence || params[:email].presence
      result = moderation('user', query: query.to_s)
      user = moderation_user_document(result)
      render :show_user, locals: { user:, fail: query && !user ? 'That user does not exist.' : nil }
    when 'deleted_users'
      @moderation_pagy, @deleted_users = moderation_list(moderation('deleted-users', page: params[:page]).fetch('users'), User); render :deleted_users
    when 'show_quarantine'
      result = moderation('quarantine'); @users = moderation_records(result, 'users', User)
      @moderation_activity = result.fetch('stats')
      visits = moderation_visit_graph(result).group_by(&:user_id)
      @users.each { |user| user.association(:ahoy_visits).target = visits.fetch(user.id, []) }
      render :show_quarantine
    when 'show_recent_events'
      result = moderation('events'); @events = moderation_records(result, 'events', Ahoy::Event)
      visits = moderation_visit_graph(result).index_by(&:id); users = moderation_records(result, 'users', User).index_by(&:id)
      @events.each do |event|
        event.association(:visit).target = visits[event.visit_id]; event.association(:user).target = users[event.user_id]
      end
      @moderation_event_previews = moderation_records(result, 'previews', PastLink).index_by(&:id); render :show_recent_events
    when 'show_password_reset'
      moderation('admin-session'); @moderation_reset = {}; render :show_password_reset
    else
      serve_moderation_write
    end
  end

  def activity_analytics_request(operation)
    return moderation(operation) unless NodeActivityBackend.enabled?
    response.set_header('X-Walltaker-Activity', 'node')
    response.set_header('Cache-Control', 'no-store')
    NodeActivityBackend.request(operation, actor_id: current_user&.id, surrender_id: browser_surrender_id)
  end

  def serve_moderation_write
    case action_name
    when 'toggle_nnn', 'toggle_invite_only'
      key = action_name == 'toggle_nnn' ? 'nnn_enabled' : 'invite_only'
      result = moderation('setting-toggle', key:); Rails.cache.delete("site_settings/#{key}")
      redirect_to(action_name == 'toggle_nnn' ? mod_tools_index_path : mod_tools_invites_path,
        notice: "#{action_name == 'toggle_nnn' ? 'NNN' : 'Invite-only mode'} #{result['enabled'] ? 'enabled' : 'disabled'}.", status: :see_other)
    when 'create_invite', 'destroy_invite'
      moderation(action_name == 'create_invite' ? 'invite-create' : 'invite-delete', id: params[:id])
      redirect_to mod_tools_invites_path, notice: action_name == 'create_invite' ? 'Invite code generated.' : 'Invite code deleted.', status: :see_other
    when 'create_emoji_link', 'update_emoji_link', 'destroy_emoji_link'
      attrs = action_name == 'destroy_emoji_link' ? {} : emoji_link_params.to_h.symbolize_keys
      moderation("emoji-#{moderation_verb}", id: params[:id], **attrs); EmojiLinkDecoration.clear_cache
      redirect_to mod_tools_emoji_links_path, notice: 'Emoji link saved.', status: :see_other
    when 'create_user_icon', 'update_user_icon', 'destroy_user_icon'
      attrs = action_name == 'destroy_user_icon' ? {} : user_icon_params.to_h.symbolize_keys
      moderation("icon-#{moderation_verb}", id: params[:id], **attrs)
      redirect_to mod_tools_user_icons_path, notice: 'User icon saved.', status: :see_other
    when 'create_wallpaper_client', 'update_wallpaper_client', 'destroy_wallpaper_client', 'move_wallpaper_client_up', 'move_wallpaper_client_down'
      if action_name.start_with?('move_')
        moderation('client-move', id: params[:id], direction: action_name.end_with?('up') ? 'up' : 'down')
      else
        attrs = action_name == 'destroy_wallpaper_client' ? {} : wallpaper_client_params.to_h
        moderation("client-#{moderation_verb}", id: params[:id], attributes: attrs)
      end
      redirect_to mod_tools_wallpaper_clients_path, notice: 'Client saved.', status: :see_other
    when 'update_profile_domain'
      result = moderation('domain-update', id: params[:id], status: params.require(:profile_domain)[:status])
      redirect_to mod_tools_profile_domains_path, notice: "#{result['domain']} is now #{result['status']}.", status: :see_other
    when 'update_user'
      attrs = params.require(:user).permit(:id, :email, :username, :details, :set_count, :quarantined, :flagged, :is_reporter, :is_cutie, :is_supporter).to_h
      target = moderation_user_document(moderation('user', user_id: attrs.delete('id')))
      @moderation_edit_user = target
      target.assign_attributes(attrs.except('details'))
      if attrs.key?('details')
        # The existing parser/sanitizers prepare content; Node validates mode
        # and owns the profile/identity transaction.
        attrs['details'] = ProfileMarkdown.dump(attrs['details']) unless target.advanced?
        attrs['details'] = ProfileDomainFilter.filter_and_record(attrs['details']).content
      end
      moderation('user-update', user_id: target.id, attributes: attrs, expected_advanced: target.advanced?)
      user = moderation_user_document(moderation('user', user_id: target.id))
      render turbo_stream: turbo_stream.replace('mod_tools_edit_user_form', partial: 'mod_tools/edit_user_form', locals: { user: })
    when 'restore_user'
      result = moderation('user-restore', user_id: params[:user]); user = moderation_user_document(moderation('user', user_id: result.fetch('user_id')))
      redirect_to account_lifecycle_return_path(user), notice: result['restored_original'] ? 'Account restored.' : 'Account restored, but its original username was unavailable.', status: :see_other
    when 'purge_user'
      moderation('user-purge', user_id: params[:user]); redirect_to account_lifecycle_return_path, notice: 'Deleted account was permanently purged.', status: :see_other
    when 'assume_user'
      if NodeBrowserBackend.enabled?
        moderation('user-assume', user_id: params[:user])
        node_browser_transition('assume', user_id: params[:user]); ahoy.authenticate(current_user)
        return redirect_to root_path
      end
      result = moderation('user-assume', user_id: params[:user]); log_in_as(User.active.find(result.fetch('user_id')))
    when 'update_quarantine', 'update_ipban'
      moderation(action_name == 'update_quarantine' ? 'user-quarantine' : 'user-ipban', user_id: params[:user])
      redirect_to quarantine_return_path(User.instantiate('id' => params[:user].to_i)), status: :see_other
    when 'update_ipban_by_event'
      moderation('event-ipban', event_id: params[:event]); redirect_to mod_tools_events_index_path, notice: 'IP banned.', status: :see_other
    when 'update_password_reset'
      @moderation_reset = moderation('password-reset', email: params[:email], case_sensitive: params[:commit] == 'Try to generate a reset link (case sensitive)')
      render :show_password_reset
    when 'destroy_link'
      moderation('link-delete', link_id: params[:id]); redirect_to mod_tools_reports_path, notice: 'Link was successfully destroyed.', status: :see_other
    end
  end

  def serve_moderation_reports
    case action_name
    when 'index', 'show', 'edit'
      result = moderation(action_name == 'index' ? 'reports' : 'report', report_id: params[:id], closed: params[:closed].present?)
      users = moderation_records(result, 'users', User).index_by(&:id); links = moderation_records(result, 'links', Link).index_by(&:id)
      links.each_value { |link| link.association(:user).target = users[link.user_id] }
      @reports = moderation_records(result, 'reports', Report)
      @reports.each do |report|
        report.association(:reporter).target = users[report.reporter_id]
        report.association(:reportable).target = report.reportable_type == 'User' ? users[report.reportable_id] : links[report.reportable_id]
      end
      @report = @reports.first; render action_name == 'index' ? :index : :show
    when 'new', 'create'
      type, id = params[:link_id] ? ['Link', params[:link_id]] : ['User', params[:user_id]]
      if action_name == 'new'
        result = moderation('report-target', reportable_type: type, reportable_id: id)
        @reportable = moderation_records({ 'target'=>[result.fetch('target')] }, 'target', type == 'User' ? User : Link).first
        @report = Report.new(reporter: current_user, reportable: @reportable); render :new
      else
        moderation('report-create', reportable_type: type, reportable_id: id, reason: params.require(:report)[:reason])
        redirect_to(type == 'User' ? new_user_report_path(id) : new_link_report_path(id), notice: 'Report was successfully created.', status: :see_other)
      end
    when 'destroy'
      moderation('report-close', report_id: params[:id]); redirect_to mod_tools_report_path(params[:id]), notice: 'Closed ticket', status: :see_other
    when 'update'
      # The existing edit endpoint was empty. Closing remains the ticket action.
      moderation('report', report_id: params[:id]); redirect_to mod_tools_report_path(params[:id]), status: :see_other
    end
  end

  def moderation_verb
    { 'create' => 'create', 'update' => 'update', 'destroy' => 'delete' }.fetch(action_name.split('_').first)
  end

  def moderation_error_path
    return params[:link_id] ? new_link_report_path(params[:link_id]) : new_user_report_path(params[:user_id]) if controller_name == 'reports' && action_name == 'create'
    case action_name
    when /emoji/ then mod_tools_emoji_links_path
    when /icon/ then mod_tools_user_icons_path
    when /wallpaper_client/ then mod_tools_wallpaper_clients_path
    when /domain/ then mod_tools_profile_domains_path
    when /invite/ then mod_tools_invites_path
    else mod_tools_index_path
    end
  end
end
