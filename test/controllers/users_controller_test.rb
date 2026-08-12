require "test_helper"

class UsersControllerTest < ActionDispatch::IntegrationTest
  self.fixture_table_names = []

  setup do
    host! "walltaker.joi.how"
    ActionMailer::Base.delivery_method = :test
    ActionMailer::Base.perform_deliveries = true
    ActionMailer::Base.deliveries.clear
    @user = User.create!(
      email: "reset@example.com",
      username: "resetuser",
      password: "password",
      password_confirmation: "password"
    )
  end

  test "password reset sends an email for an existing user" do
    assert_difference -> { ActionMailer::Base.deliveries.size }, 1 do
      post forgor_commit_path, params: { email: " RESET@example.com " }
    end

    assert_redirected_to login_path
    assert_equal UsersController::PASSWORD_RESET_NOTICE, flash[:notice]
    assert @user.reload.password_reset_sent_at.present?
  end

  test "password reset response is neutral for an unknown email" do
    assert_no_difference -> { ActionMailer::Base.deliveries.size } do
      post forgor_commit_path, params: { email: "missing@example.com" }
    end

    assert_redirected_to login_path
    assert_equal UsersController::PASSWORD_RESET_NOTICE, flash[:notice]
  end

  test "password reset cooldown skips sending another email" do
    @user.update!(password_reset_sent_at: 1.minute.ago)

    assert_no_difference -> { ActionMailer::Base.deliveries.size } do
      post forgor_commit_path, params: { email: @user.email }
    end

    assert_redirected_to login_path
    assert_equal UsersController::PASSWORD_RESET_NOTICE, flash[:notice]
  end
end
