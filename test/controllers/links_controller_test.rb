require "test_helper"

class LinksControllerTest < ActionDispatch::IntegrationTest
  test "link page includes Discord embed metadata" do
    link = links(:one)
    link.update!(never_expires: true, theme: "bondage", min_score: 42, terms: "Please be kind")

    get link_url(link)

    assert_response :success
    assert_select "html[lang='en']"
    assert_select "meta[property='og:type'][content='website']"
    assert_select "meta[property='og:title'][content='(18+) Walltaker ##{link.id} for #{link.user.username}']"
    assert_select "meta[property='og:description'][content=?]", "#{link.user.username}'s link \n theme: bondage score > 42 \n Please be kind"
    assert_select "meta[property='og:url'][content='#{link_url(link)}']"
    assert_select "meta[property='og:image'][content^='http']"
    assert_select "meta[name='theme-color'][content='#ffb300']"
  end

  test "link fork endpoint is unavailable" do
    assert_raises(ActionController::RoutingError) do
      Rails.application.routes.recognize_path("/links/#{links(:one).id}/fork", method: :post)
    end
  end
end
