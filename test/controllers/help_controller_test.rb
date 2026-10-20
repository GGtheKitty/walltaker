require "test_helper"

class HelpControllerTest < ActionDispatch::IntegrationTest
  self.fixture_table_names = []

  setup do
    host! "walltaker.joi.how"
  end

  test "should get index" do
    get help_path
    assert_response :success
  end

  test "index uses the homepage client list" do
    active_client = WallpaperClient.create!(
      name: 'Current Help Client', section: 'clients', url: 'https://example.com/current', platform: 'CurrentOS'
    )
    deprecated_client = WallpaperClient.create!(
      name: 'Old Help Client', section: 'clients', url: 'https://example.com/old', platform: 'OldOS', deprecated: true
    )

    get help_path

    assert_response :success
    assert_select '.wallpaper-clients tbody tr', count: 2
    assert_select ".wallpaper-clients a[href='#{active_client.url}']:not(.subdued)", text: active_client.name
    assert_select ".wallpaper-clients a.subdued[href='#{deprecated_client.url}']", text: deprecated_client.name
    assert_select '.wallpaper-clients strong', text: '(Deprecated)', count: 1
  end

  test "client guide pins external syntax highlighting assets" do
    get client_guide_path

    assert_response :success
    assert_select "script[src^='https://cdnjs.cloudflare.com/']", count: 5 do |scripts|
      scripts.each do |script|
        assert_match(/\Asha384-[A-Za-z0-9+\/=]+\z/, script['integrity'])
        assert_equal 'anonymous', script['crossorigin']
      end
    end
    assert_pinned_highlight_stylesheet
  end

  test "deprecated client guide pins external syntax highlighting assets" do
    get deprecated_client_guide_path

    assert_response :success
    assert_select "script[src^='https://cdnjs.cloudflare.com/']", count: 2 do |scripts|
      scripts.each do |script|
        assert_match(/\Asha384-[A-Za-z0-9+\/=]+\z/, script['integrity'])
        assert_equal 'anonymous', script['crossorigin']
      end
    end
    assert_pinned_highlight_stylesheet
  end

  private

  def assert_pinned_highlight_stylesheet
    assert_select "link[rel='stylesheet'][href^='https://cdnjs.cloudflare.com/']", count: 1 do |stylesheets|
      stylesheet = stylesheets.first
      assert_match(/\Asha384-[A-Za-z0-9+\/=]+\z/, stylesheet['integrity'])
      assert_equal 'anonymous', stylesheet['crossorigin']
    end
  end
end
