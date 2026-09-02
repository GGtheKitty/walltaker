require "test_helper"

class ApiControllerTest < ActionDispatch::IntegrationTest
  self.fixture_table_names = []

  setup do
    host! "walltaker.joi.how"
    @user = User.create!(
      username: "ApiResponseUser",
      email: "api-response@example.com",
      password: "password",
      password_confirmation: "password",
      api_key: "test-key"
    )
    @link = @user.link.create!(never_expires: true, min_score: 0)
  end

  test "API key authorizes a link response without a CSRF token" do
    with_forgery_protection do
      post "/api/links/#{@link.id}/response.json",
           params: { api_key: @user.api_key, type: "ok", text: "Thanks" },
           as: :json
    end

    assert_response :success
    assert_equal "ok", @link.reload.response_type
    assert_equal "Thanks", @link.response_text
  end

  test "invalid API key cannot change a link response" do
    with_forgery_protection do
      post "/api/links/#{@link.id}/response.json",
           params: { api_key: "wrong-key", type: "came", text: "Forged" },
           as: :json
    end

    assert_response :forbidden
    assert_nil @link.reload.response_type
    assert_nil @link.response_text
  end

  private

  def with_forgery_protection
    original = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    yield
  ensure
    ActionController::Base.allow_forgery_protection = original
  end
end
