require 'test_helper'

class InviteSystemTest < ActionDispatch::IntegrationTest
  self.fixture_table_names = []

  setup do
    host! 'walltaker.joi.how'
    Rails.cache.delete('site_settings/invite_only')
    @admin = create_user('inviteadmin', 'invite-admin@example.com', admin: true)
  end

  teardown do
    Rails.cache.delete('site_settings/invite_only')
  end

  test 'admin can generate list and delete invite codes' do
    log_in(@admin)

    assert_difference -> { InviteCode.count }, 1 do
      post mod_tools_invites_path
    end

    invite = InviteCode.last
    assert_equal @admin, invite.generated_by
    assert_match(/\A[0-9A-F]{16}\z/, invite.code)

    get mod_tools_invites_path
    assert_response :success
    assert_select 'code', text: invite.code
    assert_select 'td', text: @admin.username

    assert_difference -> { InviteCode.count }, -1 do
      delete mod_tools_invite_path(invite)
    end
  end

  test 'admin can toggle invite-only mode' do
    log_in(@admin)

    assert_not SiteConfig.invite_only?
    post mod_tools_toggle_invite_only_path
    assert_redirected_to mod_tools_invites_path
    assert SiteConfig.invite_only?

    post mod_tools_toggle_invite_only_path
    assert_not SiteConfig.invite_only?
  end

  test 'invite-only signup redeems a code exactly once' do
    SiteConfig.invite_only = true
    invite = InviteCode.generate!(generated_by: @admin)

    assert_difference -> { User.count }, 1 do
      post users_path, params: signup_params('invited', 'invited@example.com').merge(invite_code: invite.code.downcase)
    end

    invited_user = User.find_by!(username: 'invited')
    assert_redirected_to links_path
    assert_equal invited_user, invite.reload.redeemed_by
    assert invite.redeemed_at.present?

    assert_no_difference -> { User.count } do
      post users_path, params: signup_params('seconduser', 'second@example.com').merge(invite_code: invite.code)
    end
    assert_response :unprocessable_entity
    assert_select '.error li', text: 'Invite code is invalid or has already been used.'
  end

  test 'invite-only signup rejects a missing or invalid code' do
    SiteConfig.invite_only = true

    assert_no_difference -> { User.count } do
      post users_path, params: signup_params('uninvited', 'uninvited@example.com').merge(invite_code: 'NOT-A-CODE')
    end

    assert_response :unprocessable_entity
    assert_select "input[name='invite_code'][required]"
  end

  test 'open signup does not require an invite code' do
    SiteConfig.invite_only = false

    assert_difference -> { User.count }, 1 do
      post users_path, params: signup_params('openuser', 'open@example.com')
    end
  end

  test 'evil login routes are blocked in invite-only mode' do
    evil = create_user('evil', 'evil-invite@example.com')
    SiteConfig.invite_only = true

    post session_index_path, params: { email: evil.email, password: 'password' }
    assert_response :unprocessable_entity
    assert_includes response.body, 'The evil account is unavailable while invite-only mode is enabled.'

    get be_evil_path
    assert_redirected_to login_path

    get login_path
    assert_response :success
    assert_select "a[href='#{be_evil_path}']", count: 0
  end

  test 'an existing evil session is ended when invite-only mode is enabled' do
    create_user('evil', 'evil-session@example.com')
    SiteConfig.invite_only = false
    get be_evil_path
    assert_redirected_to root_path

    SiteConfig.invite_only = true
    get root_path
    assert_redirected_to login_path

    follow_redirect!
    assert_response :success
    assert_includes response.body, 'The evil account is unavailable while invite-only mode is enabled.'
  end

  private

  def create_user(username, email, admin: false)
    User.create!(
      username:,
      email:,
      admin:,
      password: 'password',
      password_confirmation: 'password'
    )
  end

  def log_in(user)
    post session_index_path, params: { email: user.email, password: 'password' }
    assert_redirected_to root_path
  end

  def signup_params(username, email)
    {
      user: {
        username:,
        email:,
        password: 'password',
        password_confirmation: 'password'
      }
    }
  end
end
