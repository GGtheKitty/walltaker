require "test_helper"

class SessionControllerTest < ActionDispatch::IntegrationTest
  self.fixture_table_names = []

  setup do
    host! "walltaker.joi.how"
    @user = User.create!(
      username: "LoginBothWays",
      email: "login-both-ways@example.com",
      password: "password",
      password_confirmation: "password"
    )
  end

  test "login form accepts an email or username" do
    get login_path

    assert_response :success
    assert_select "label[for='email']", text: "Email or username"
    assert_select "input[name='email'][autocomplete='username']"
  end

  test "user can log in with their email" do
    post session_index_path, params: { email: @user.email, password: "password" }

    assert_redirected_to root_path
    follow_redirect!
    assert_select ".user-tools .username", text: @user.username
  end

  test "user can log in with their username case-insensitively" do
    post session_index_path, params: { email: "  loginbothways  ", password: "password" }

    assert_redirected_to root_path
    follow_redirect!
    assert_select ".user-tools .username", text: @user.username
  end

  test "invalid credentials use a generic error" do
    post session_index_path, params: { email: @user.username, password: "wrong" }

    assert_response :unprocessable_entity
    assert_select ".error_messages", text: "Wrong email, username, or password."
  end
end
