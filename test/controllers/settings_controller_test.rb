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
    assert_select "input[name='user[username]'][value='SettingsUser']"
    assert_select "input[name='user[current_password]']"
    assert_select "input[name='user[password]']"
    assert_select "input[name='user[password_confirmation]']"
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

  def create_user(username:, email:, colour_preference: :auto)
    User.create!(
      username:,
      email:,
      password: "password",
      password_confirmation: "password",
      colour_preference:
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
