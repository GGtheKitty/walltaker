require "test_helper"

class SettingsControllerTest < ActionDispatch::IntegrationTest
  self.fixture_table_names = []

  setup do
    host! "walltaker.joi.how"
  end

  test "shows settings for the signed in user" do
    user = create_user(username: "SettingsUser", email: "settings@example.com")

    log_in(user)

    get settings_url

    assert_response :success
    assert_select "title", /SettingsUser walltaker settings/
    assert_select "h2", /SettingsUser's settings/
    assert_select "small.settings__username-note", text: "You can only change your username once a week"
    assert_select ".settings__username-fields" do
      assert_select "input[name='user[username]'][value='SettingsUser']"
    end
    assert_select ".settings__password-fields" do
      assert_select "input[name='user[current_password]']"
      assert_select "input[name='user[password]']"
      assert_select "input[name='user[password_confirmation]']"
    end
    assert_select ".accent-block.danger" do
      assert_select "input[name='account[password]']"
      assert_select "input[type='submit'][value='Delete Account']"
    end
  end

  test "does not show username or password settings for the evil account" do
    user = create_user(username: "evil", email: "evil@example.com")

    log_in(user)
    get settings_url

    assert_response :success
    assert_select "input[name='user[colour_preference]']"
    assert_select "input[name='user[username]']", count: 0
    assert_select "input[name='user[current_password]']", count: 0
    assert_select "input[name='user[password]']", count: 0
    assert_select "input[name='user[password_confirmation]']", count: 0
    assert_select "input[name='account[password]']", count: 0
    assert_select "input[type='submit'][value='Delete Account']", count: 0
  end

  test "does not delete an account when the password is incorrect" do
    user = create_user(username: "KeepMyAccount", email: "keep-account@example.com")

    log_in(user)
    delete settings_url, params: { account: { password: "wrong-password" } }

    assert_redirected_to settings_path
    assert_not user.reload.deleted?
    assert_equal "Current password is incorrect.", flash[:alert]
  end

  test "soft deletes an account and preserves its hidden data" do
    user = create_user(username: "DeleteMyAccount", email: "delete-account@example.com")
    profile = user.profiles.create!(content: "Preserved profile")
    user.update_column(:profile_id, profile.id)
    link = user.link.create!(never_expires: true, min_score: 0)
    user.update_columns(api_key: "keep-key", viewing_link_id: link.id)
    api_key = user.api_key
    viewing_link_id = user.viewing_link_id

    log_in(user)
    delete settings_url, params: { account: { password: "password" } }

    assert_redirected_to login_path
    deleted_user = User.find(user.id)
    assert deleted_user.deleted?
    assert_equal "DeleteMyAccount", deleted_user.deleted_username
    assert_match(/\ADeleteMyAccount[[:alnum:]]{10}\z/, deleted_user.username)
    assert_not User.active.exists?(user.id)
    assert_not Link.exists?(link.id)
    assert Link.unscoped.exists?(link.id)
    assert_not Profile.exists?(profile.id)
    assert Profile.unscoped.exists?(profile.id)
    assert_equal api_key, deleted_user.api_key
    assert_equal viewing_link_id, deleted_user.viewing_link_id

    get "/users/DeleteMyAccount"
    assert_response :not_found
    get "/api/links/#{link.id}.json"
    assert_response :not_found

    assert User.create!(username: "DeleteMyAccount", email: "reused-name@example.com", password: "password")

    post session_index_path, params: { email: deleted_user.email, password: "password" }
    assert_response :unprocessable_entity
  end

  test "does not delete the evil account through a crafted request" do
    user = create_user(username: "evil", email: "evil-delete@example.com")

    log_in(user)
    delete settings_url, params: { account: { password: "password" } }

    assert_redirected_to settings_path
    assert_not user.reload.deleted?
    assert_equal "The evil account cannot be deleted.", flash[:alert]
  end

  test "surrender controller sees their own settings instead of the surrendered user's settings" do
    controller = create_user(username: "ControllerUser", email: "controller@example.com")
    surrendered = create_user(username: "SurrenderedUser", email: "surrendered@example.com")
    surrender = create_surrender(user: surrendered, controller:)

    log_in(controller)
    post assume_surrender_path(surrender)

    get settings_url

    assert_response :success
    assert_select "title", /ControllerUser walltaker settings/
    assert_select "h2", /ControllerUser's settings/
    assert_no_match "SurrenderedUser's settings", response.body
  end

  test "surrender controller saves their own settings instead of the surrendered user's settings" do
    controller = create_user(username: "ControllerSave", email: "controller-save@example.com", colour_preference: :auto)
    surrendered = create_user(username: "SurrenderedSave", email: "surrendered-save@example.com", colour_preference: :dark)
    surrender = create_surrender(user: surrendered, controller:)

    log_in(controller)
    post assume_surrender_path(surrender)

    post settings_url, params: { user: { colour_preference: "light" } }

    assert_redirected_to user_path(controller.username)
    assert_equal "light", controller.reload.colour_preference
    assert_equal "dark", surrendered.reload.colour_preference
  end

  test "changes username when the requested username is available" do
    user = create_user(username: "OldUsername", email: "old-username@example.com")

    log_in(user)

    post settings_url, params: { settings_action: "username", user: { username: "NewUsername" } }

    assert_redirected_to user_path("NewUsername")
    assert_equal "NewUsername", user.reload.username
    assert_in_delta Time.current, user.username_changed_at, 1.second
  end

  test "does not show username form during the rename cooldown" do
    user = create_user(
      username: "RecentlyRenamed",
      email: "recently-renamed@example.com",
      username_changed_at: 2.days.ago
    )

    log_in(user)
    get settings_url

    assert_response :success
    assert_select "input[name='user[username]']", count: 0
    assert_select "time[datetime='#{user.next_username_change_at.iso8601}']"
    assert_select "input[name='user[current_password]']"
  end

  test "does not change username again during the cooldown" do
    user = create_user(
      username: "CooldownUser",
      email: "cooldown-user@example.com",
      username_changed_at: 6.days.ago
    )

    log_in(user)
    post settings_url, params: { settings_action: "username", user: { username: "TooSoon" } }

    assert_redirected_to settings_path
    assert_equal "CooldownUser", user.reload.username
    assert_equal "Username can only be changed once a week.", flash[:alert]
  end

  test "changes username once the cooldown has elapsed" do
    user = create_user(
      username: "CooldownElapsed",
      email: "cooldown-elapsed@example.com",
      username_changed_at: 1.week.ago
    )

    log_in(user)
    post settings_url, params: { settings_action: "username", user: { username: "AvailableAgain" } }

    assert_redirected_to user_path("AvailableAgain")
    assert_equal "AvailableAgain", user.reload.username
    assert_in_delta Time.current, user.username_changed_at, 1.second
  end

  test "does not change username when the requested username is unavailable" do
    user = create_user(username: "AvailableUser", email: "available-user@example.com")
    create_user(username: "TakenUser", email: "taken-user@example.com")

    log_in(user)

    post settings_url, params: { settings_action: "username", user: { username: "takenuser" } }

    assert_redirected_to settings_path
    assert_equal "AvailableUser", user.reload.username
    assert_equal "takenuser is not available.", flash[:alert]
  end

  test "does not change the evil account username" do
    user = create_user(username: "evil", email: "evil-rename@example.com")

    log_in(user)
    post settings_url, params: { settings_action: "username", user: { username: "NotEvil" } }

    assert_redirected_to settings_path
    assert_equal "evil", user.reload.username
    assert_equal "The evil account's username cannot be changed.", flash[:alert]
  end

  test "surrender controller changes their own username instead of the surrendered user's username" do
    controller = create_user(username: "ControllerRename", email: "controller-rename@example.com")
    surrendered = create_user(username: "SurrenderedRename", email: "surrendered-rename@example.com")
    surrender = create_surrender(user: surrendered, controller:)

    log_in(controller)
    post assume_surrender_path(surrender)

    post settings_url, params: { settings_action: "username", user: { username: "RenamedController" } }

    assert_redirected_to user_path("RenamedController")
    assert_equal "RenamedController", controller.reload.username
    assert_equal "SurrenderedRename", surrendered.reload.username
  end

  test "changes password when the current password is correct" do
    user = create_user(username: "PasswordUser", email: "password-user@example.com")

    log_in(user)

    post settings_url, params: {
      settings_action: "password",
      user: {
        current_password: "password",
        password: "new-password",
        password_confirmation: "new-password"
      }
    }

    assert_redirected_to settings_path
    assert user.reload.authenticate("new-password")
  end

  test "does not change password when the current password is incorrect" do
    user = create_user(username: "WrongPasswordUser", email: "wrong-password-user@example.com")

    log_in(user)

    post settings_url, params: {
      settings_action: "password",
      user: {
        current_password: "wrong-password",
        password: "new-password",
        password_confirmation: "new-password"
      }
    }

    assert_redirected_to settings_path
    assert user.reload.authenticate("password")
    assert_equal "Current password is incorrect.", flash[:alert]
  end

  test "does not change the evil account password" do
    user = create_user(username: "evil", email: "evil-password@example.com")

    log_in(user)
    post settings_url, params: {
      settings_action: "password",
      user: {
        current_password: "password",
        password: "new-password",
        password_confirmation: "new-password"
      }
    }

    assert_redirected_to settings_path
    assert user.reload.authenticate("password")
    assert_equal "The evil account's password cannot be changed.", flash[:alert]
  end

  test "does not change password to a blank password" do
    user = create_user(username: "BlankPasswordUser", email: "blank-password-user@example.com")

    log_in(user)

    post settings_url, params: {
      settings_action: "password",
      user: {
        current_password: "password",
        password: "",
        password_confirmation: ""
      }
    }

    assert_redirected_to settings_path
    assert user.reload.authenticate("password")
    assert_equal "New password can't be blank.", flash[:alert]
  end

  private

  def log_in(user)
    post session_index_path, params: { email: user.email, password: "password" }
  end

  def create_user(username:, email:, colour_preference: :auto, username_changed_at: nil)
    User.create!(
      username:,
      email:,
      password: "password",
      password_confirmation: "password",
      colour_preference:,
      username_changed_at:
    )
  end

  def create_surrender(user:, controller:)
    friendship = Friendship.create!(
      sender: user,
      receiver: controller,
      confirmed: true
    )

    Surrender.create!(
      user:,
      friendship:,
      controller_user_id: controller.id,
      accepted_consequences: true,
      expires_at: 1.day.from_now,
      token: SecureRandom.uuid
    )
  end
end
