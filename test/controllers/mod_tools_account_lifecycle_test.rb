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

  private

  def create_user(username:, email:, admin: false)
    User.create!(
      username:,
      email:,
      admin:,
      password: "password",
      password_confirmation: "password"
    )
  end
end
