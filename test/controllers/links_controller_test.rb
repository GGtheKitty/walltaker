require "test_helper"

class LinksControllerTest < ActionDispatch::IntegrationTest
  test "link page includes Discord embed metadata" do
    link = links(:one)
    WallpaperClient.create!(
      name: "Embed Client",
      section: "hidden",
      match_text: "EmbedClient/",
      link_name: "Friendly Embed Client"
    )
    link.past_links.create!(created_at: 10.minutes.ago)
    link.update!(
      never_expires: true,
      theme: "bondage",
      min_score: 42,
      terms: "Please be kind",
      last_ping_user_agent: "EmbedClient/2.0"
    )

    get link_url(link)

    assert_response :success
    assert_select "html[lang='en']"
    assert_select "meta[property='og:type'][content='website']"
    assert_select "meta[property='og:title'][content='(18+) Walltaker ##{link.id} for #{link.user.username}']"
    assert_select "meta[property='og:description'][content=?]", "Last changed 10 minutes ago \n theme: bondage score > 42 \n Current client: Friendly Embed Client"
    assert_select "meta[property='og:url'][content='#{link_url(link)}']"
    assert_select "meta[property='og:image'][content^='http']"
    assert_select "meta[name='theme-color'][content='#ffb300']"
  end

  test "Discord embed metadata falls back to an unrecognized client identity" do
    link = links(:one)
    link.update!(never_expires: true, theme: "", min_score: 0, last_ping_user_agent: "Custom Wallpaper Client/1.0")

    get link_url(link)

    assert_response :success
    assert_select "meta[property='og:description'][content=?]", "Last changed never \n \n Current client: Custom Wallpaper Client/1.0"
  end

  test "link fork endpoint is unavailable" do
    assert_raises(ActionController::RoutingError) do
      Rails.application.routes.recognize_path("/links/#{links(:one).id}/fork", method: :post)
    end
  end
end
