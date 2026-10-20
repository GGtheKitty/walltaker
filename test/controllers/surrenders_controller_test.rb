require "test_helper"

class SurrendersControllerTest < ActionDispatch::IntegrationTest
  self.fixture_table_names = []

  setup do
    host! "walltaker.joi.how"
  end

  test "shows surrender index" do
    user = create_user(username: "SurrenderIndex", email: "surrender-index@example.com")
    log_in(user)

    get surrenders_url

    assert_response :success
  end

  test "creates a surrender with controller and token" do
    user = create_user(username: "SurrenderUser", email: "surrender-user@example.com")
    controller = create_user(username: "SurrenderController", email: "surrender-controller@example.com")
    friendship = create_friendship(user, controller)
    log_in(user)

    assert_difference "Surrender.count", 1 do
      post surrenders_url, params: {
        surrender: {
          friendship: friendship.id,
          duration: 24,
          accepted_consequences: "1",
          pending: "0"
        }
      }
    end

    surrender = Surrender.order(:id).last
    assert_redirected_to surrender_path(surrender)
    assert_equal user, surrender.user
    assert_equal controller, surrender.controller
    assert_equal 24, surrender.duration_hours
    assert_not_empty surrender.token
  end

  test "controller can return to their account from a surrender session" do
    user = create_user(username: "SurrenderReturnUser", email: "surrender-return-user@example.com")
    controller = create_user(username: "SurrenderReturnController", email: "surrender-return-controller@example.com")
    surrender = create_surrender(user:, controller:)
    log_in(controller)

    post assume_surrender_path(surrender)
    follow_redirect!

    assert_select '.user-tools .username', text: user.username
    assert_select "a.return-from-surrender[href='#{return_to_controller_surrenders_path}']",
                  text: "Return to #{controller.username}"

    post return_to_controller_surrenders_path

    assert_redirected_to root_path
    assert_not surrender.reload.logged_in?
    assert_nil surrender.current_page

    follow_redirect!
    assert_select '.user-tools .username', text: controller.username
    assert_select 'a.return-from-surrender', count: 0
  end

  test "return link and action are unavailable outside the active controller session" do
    user = create_user(username: "SurrenderNoReturnUser", email: "surrender-no-return-user@example.com")
    controller = create_user(username: "SurrenderNoReturnController", email: "surrender-no-return-controller@example.com")
    surrender = create_surrender(user:, controller:)
    log_in(controller)

    get root_path
    assert_select 'a.return-from-surrender', count: 0

    post return_to_controller_surrenders_path
    assert_redirected_to root_path
    assert_equal 'Not allowed.', flash[:alert]

    log_in(user)
    get surrender_path(surrender)
    assert_select '.user-tools .username', text: user.username
    assert_select 'a.return-from-surrender', count: 0
  end

  private

  def log_in(user)
    post session_index_path, params: { email: user.email, password: "password" }
  end

  def create_user(username:, email:)
    User.create!(
      username:,
      email:,
      password: "password",
      password_confirmation: "password"
    )
  end

  def create_friendship(user, friend)
    Friendship.create!(
      sender: user,
      receiver: friend,
      confirmed: true
    )
  end

  def create_surrender(user:, controller:)
    friendship = create_friendship(user, controller)
    Surrender.create!(
      user:,
      controller_user: controller,
      friendship:,
      accepted_consequences: true,
      expires_at: 1.day.from_now
    )
  end
end
