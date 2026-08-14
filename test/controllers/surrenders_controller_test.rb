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
end
