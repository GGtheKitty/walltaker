require "test_helper"

class ModToolsAccountLifecycleTest < ActionDispatch::IntegrationTest
  self.fixture_table_names = []

  setup do
    host! "walltaker.joi.how"
    SiteConfig.nnn_enabled = false
    @admin = create_user(username: "AccountAdmin", email: "account-admin@example.com", admin: true)
    post session_index_path, params: { email: @admin.email, password: "password" }
  end

  teardown do
    Rails.cache.delete("site_settings/nnn_enabled")
    EmojiLinkDecoration.clear_cache
  end

  test "moderator can enable NNN without calling it the Nut Tracker" do
    get mod_tools_index_path

    assert_response :success
    assert_select "form[action='#{mod_tools_toggle_nnn_path}']", text: /Enable NNN/
    assert_no_match(/Nut Tracker \(NNN\)/, response.body)

    post mod_tools_toggle_nnn_path

    assert_redirected_to mod_tools_index_path
    assert_equal "NNN enabled.", flash[:notice]
    assert SiteConfig.nnn_enabled?
  end

  test "moderator can manage emoji links from Misc Fun" do
    seeded_decoration = EmojiLinkDecoration.create!(link_id: 1, emoji: '🐕')

    get mod_tools_index_path

    assert_select 'h3', text: 'Misc. Fun'
    assert_select "form[action='#{mod_tools_emoji_links_path}'] button.secondary", text: 'Emoji Links'

    get mod_tools_emoji_links_path
    assert_response :success
    assert_select 'h2', text: /Emoji Links/
    assert_select 'form .form__row', count: 2
    assert_select "tr##{dom_id(seeded_decoration)} td:last-child" do |cells|
      assert_equal %w[Save Remove], cells.first.css('button').map { |button| button.text.strip }
    end
    assert_equal '🐕', EmojiLinkDecoration.emoji_map.fetch(1)
    links_helper = Object.new.extend(LinksHelper)
    assert_equal '🐕', links_helper.link_id_for_decoration(1)
    assert_equal 999_992, links_helper.link_id_for_decoration(999_992)
    assert_not EmojiLinkDecoration.new(link_id: 999_993, emoji: 'A').valid?

    post mod_tools_emoji_links_path, params: { emoji_link_decoration: { link_id: 999_991, emoji: '✨' } }
    decoration = EmojiLinkDecoration.find_by!(link_id: 999_991)
    assert_redirected_to mod_tools_emoji_links_path
    assert_equal '✨', EmojiLinkDecoration.emoji_map.fetch(999_991)

    patch mod_tools_emoji_link_path(decoration), params: { emoji_link_decoration: { link_id: 999_991, emoji: '🎉' } }
    assert_redirected_to mod_tools_emoji_links_path
    assert_equal '🎉', decoration.reload.emoji

    delete mod_tools_emoji_link_path(decoration)
    assert_redirected_to mod_tools_emoji_links_path
    assert_not EmojiLinkDecoration.exists?(decoration.id)
  end

  test "moderator can manage user icons from Misc Fun" do
    icon_user = create_user(username: 'IconUser', email: 'icon-user@example.com')

    get mod_tools_index_path

    assert_select 'h3', text: 'Misc. Fun'
    assert_select "form[action='#{mod_tools_user_icons_path}'] button.secondary", text: 'User Icons'

    get mod_tools_user_icons_path
    assert_response :success
    assert_select 'h2', text: /User Icons/
    assert_select 'form .form__row', count: 2

    post mod_tools_user_icons_path, params: { user_icon: { username: icon_user.username, icon_name: 'rocket-outline' } }
    user_icon = UserIcon.find_by!(user: icon_user)
    assert_redirected_to mod_tools_user_icons_path
    assert_equal 'rocket-outline', user_icon.icon_name

    get user_path(icon_user.username)
    assert_response :success
    assert_select "ion-icon[name='rocket-outline'].big", count: 1

    patch mod_tools_user_icon_path(user_icon), params: { user_icon: { icon_name: 'planet-outline' } }
    assert_redirected_to mod_tools_user_icons_path
    assert_equal 'planet-outline', user_icon.reload.icon_name

    delete mod_tools_user_icon_path(user_icon)
    assert_redirected_to mod_tools_user_icons_path
    assert_not UserIcon.exists?(user_icon.id)
  end

  test "moderator can manage homepage and recognized clients from Misc Fun" do
    get mod_tools_index_path

    assert_select "form[action='#{mod_tools_wallpaper_clients_path}'] button.secondary", text: 'Clients'

    get mod_tools_wallpaper_clients_path
    assert_response :success
    assert_select 'h2', text: /Clients/

    client_params = {
      name: 'Test Mobile Client',
      section: 'clients',
      url: 'https://example.com/client',
      platform: 'TestOS',
      match_text: 'TestClient/',
      link_name: 'Test Client',
      icon_name: 'rocket-outline',
      device_type: 'mobile',
      deprecated: false
    }
    post mod_tools_wallpaper_clients_path, params: { wallpaper_client: client_params }
    client = WallpaperClient.find_by!(name: 'Test Mobile Client')
    assert_redirected_to mod_tools_wallpaper_clients_path

    get root_path
    assert_response :success
    assert_select "a[href='https://example.com/client']", text: 'Test Mobile Client'

    assert_equal client, WallpaperClient.for_user_agent('Example TestClient/1.0')
    links_helper = Object.new.extend(LinksHelper)
    assert_equal client, links_helper.client_for_user_agent('Example TestClient/1.0')

    link_owner = create_user(username: 'ClientOwner', email: 'client-owner@example.com')
    link_owner.link.create!(never_expires: true, friends_only: false, min_score: 0, last_ping_user_agent: 'Example TestClient/1.0')
    get user_path(link_owner.username)
    assert_response :success
    assert_select '.link--device-in-use span', text: 'Test Client'
    assert_select ".link--device-in-use ion-icon[name='rocket-outline']"

    second_client = WallpaperClient.create!(name: 'Second Client', section: 'hidden')
    post mod_tools_wallpaper_client_move_up_path(second_client)
    assert_redirected_to mod_tools_wallpaper_clients_path(anchor: dom_id(second_client))
    assert_equal second_client, WallpaperClient.ordered.first

    post mod_tools_wallpaper_client_move_down_path(second_client)
    assert_redirected_to mod_tools_wallpaper_clients_path(anchor: dom_id(second_client))
    assert_equal client, WallpaperClient.ordered.first

    patch mod_tools_wallpaper_client_path(client), params: {
      wallpaper_client: client_params.merge(section: 'companion_apps', link_name: 'Renamed Client')
    }
    assert_redirected_to mod_tools_wallpaper_clients_path
    assert_equal 'companion_apps', client.reload.section
    assert_equal 'Renamed Client', client.link_label

    delete mod_tools_wallpaper_client_path(client)
    assert_redirected_to mod_tools_wallpaper_clients_path
    assert_not WallpaperClient.exists?(client.id)
  end

  test "moderator can open separate System and Activity analytics pages" do
    get mod_tools_index_path

    assert_select 'h3', text: 'Analytics'
    assert_select "form[action='#{mod_tools_system_analytics_path}']", text: /System/
    assert_select "form[action='#{mod_tools_activity_analytics_path}']", text: /Activity/

    get mod_tools_system_analytics_path
    assert_response :success
    assert_select 'h2', text: /System/
    assert_select 'th', text: 'CPU'
    assert_select 'td', text: 'PostgreSQL'
    assert_select 'td', text: 'Redis'

    get mod_tools_activity_analytics_path
    assert_response :success
    assert_select 'h2', text: /Activity/
    assert_select 'th', text: 'Online users'
    assert_select 'th', text: 'Online links'
    assert_select 'th', text: 'Last 24 hours'
  end

  test "moderator can inspect and restore a deleted account" do
    user = create_user(username: "RestoreMe", email: "restore-me@example.com")
    user.soft_delete!

    get mod_tools_users_index_path, params: { email: "RestoreMe" }

    assert_response :success
    assert_select ".accent-block.danger", text: /Original username: RestoreMe/
    assert_select "form[action='#{mod_tools_users_restore_path(user)}']"

    post mod_tools_users_restore_path(user)

    assert_redirected_to mod_tools_users_index_path(email: user.email)
    assert_not user.reload.deleted?
    assert_equal "RestoreMe", user.username
  end

  test "moderator can search active users by username or email" do
    user = create_user(username: "SearchablePerson", email: "find-me@example.com")

    get mod_tools_users_index_path, params: { query: "Searchable" }
    assert_response :success
    assert_select ".mod_tool__result--success", text: /#{user.username}/

    get mod_tools_users_index_path, params: { query: "find-me@example.com" }
    assert_response :success
    assert_select ".mod_tool__result--success", text: /#{user.username}/
  end

  test "moderator can rename a user during the username cooldown" do
    user = create_user(username: "CooldownRename", email: "mod-rename@example.com")
    user.update_column(:username_changed_at, 1.day.ago)

    post mod_tools_users_update_path, params: {
      user: {
        id: user.id,
        username: "ModeratorRenamed",
        email: user.email
      }
    }

    assert_response :success
    assert_equal "ModeratorRenamed", user.reload.username
    assert_in_delta Time.current, user.username_changed_at, 1.second
  end

  test "deleted account queue lists every deleted account and provides actions" do
    first_user = create_user(username: "FirstDeleted", email: "first-deleted@example.com")
    second_user = create_user(username: "SecondDeleted", email: "second-deleted@example.com")
    active_user = create_user(username: "StillActive", email: "still-active@example.com")
    first_user.soft_delete!
    second_user.soft_delete!

    get mod_tools_users_index_path
    assert_select "a[href='#{mod_tools_users_deleted_path}']", text: 'Deleted Account Queue'

    get mod_tools_users_deleted_path
    assert_response :success
    assert_select "tr##{dom_id(first_user)}"
    assert_select "tr##{dom_id(second_user)}"
    assert_select "tr##{dom_id(active_user)}", count: 0
    assert_select "form[action='#{mod_tools_users_restore_path(first_user)}']"
    assert_select "form[action='#{mod_tools_users_purge_path(first_user)}']"

    post mod_tools_users_restore_path(first_user), params: { return_to: 'deleted_accounts' }
    assert_redirected_to mod_tools_users_deleted_path
  end

  test "quarantine actions only redirect to local return paths" do
    user = create_user(username: "QuarantineTarget", email: "quarantine-target@example.com")
    fallback_path = mod_tools_quarantine_index_path(anchor: dom_id(user))

    post mod_tools_quarantine_update_path(user), params: { return_to: "https://attacker.example/phishing" }
    assert_redirected_to fallback_path

    post mod_tools_quarantine_update_path(user), params: { return_to: mod_tools_reports_path }
    assert_redirected_to mod_tools_reports_path

    post mod_tools_quarantine_ipban_path(user), params: { return_to: "//attacker.example/phishing" }
    assert_redirected_to fallback_path
  end

  test "moderator can permanently purge a deleted account" do
    user = create_user(username: "PurgeMe", email: "purge-me@example.com")
    profile = user.profiles.create!(content: "Purge this profile")
    user.update_column(:profile_id, profile.id)
    link = user.link.create!(never_expires: true, min_score: 0)
    user.soft_delete!

    delete mod_tools_users_purge_path(user)

    assert_redirected_to mod_tools_users_index_path
    assert_not User.exists?(user.id)
    assert_not Link.unscoped.exists?(link.id)
    assert_not Profile.unscoped.exists?(profile.id)
  end

  test "moderator can assume a system account" do
    system_user = create_user(
      username: "ModeratorOnlyRobot",
      email: "moderator-only-robot@example.com",
      system_account: true
    )

    get mod_tools_users_assume_path(system_user)

    assert_redirected_to root_path
    follow_redirect!
    assert_select ".user-tools .username", text: system_user.username
  end

  private

  def create_user(username:, email:, admin: false, system_account: false)
    User.create!(
      username:,
      email:,
      admin:,
      system_account:,
      password: "password",
      password_confirmation: "password"
    )
  end
end
