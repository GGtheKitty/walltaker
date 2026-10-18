require "test_helper"

class LinksControllerTest < ActionDispatch::IntegrationTest
  test "link fork endpoint is unavailable" do
    assert_raises(ActionController::RoutingError) do
      Rails.application.routes.recognize_path("/links/#{links(:one).id}/fork", method: :post)
    end
  end
end
