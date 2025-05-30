import { Route } from '@/types';

import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import path from 'node:path';
import { art } from '@/utils/render';

import { CookieJar } from 'tough-cookie';
const cookieJar = new CookieJar();

export const route: Route = {
    path: ['/:journal/vol/:issue', '/:journal/:issue'],
    radar: [
        {
            source: ['www.sciencedirect.com/journal/:journal/*'],
            target: '/:journal',
        },
    ],
    name: 'Unknown',
    maintainers: [],
    handler,
};

async function handler(ctx) {
    const journal = ctx.req.param('journal');
    const issue = 'Volume ' + ctx.req.param('issue').replace('-', ' Issue ');
    const host = 'https://www.sciencedirect.com';
    const issueUrl = `${host}/journal/${journal}/vol/${ctx.req.param('issue').replace('-', '/issue/')}`;

    const response = await got(issueUrl, {
        cookieJar,
    });
    const $ = load(response.data);
    const jrnlName = $('.anchor.js-title-link').text();
    const list = $('.js-article')
        .toArray()
        .map((item) => {
            const title = $(item).find('.js-article-title').text();
            const authors = $(item).find('.js-article__item__authors').text();
            const link = $(item).find('.article-content-title').attr('href');
            const id = $(item).find('.article-content-title').attr('id');
            return {
                title,
                link,
                id,
                authors,
                issue,
            };
        });

    const renderDesc = (item) =>
        art(path.join(__dirname, 'templates/description.art'), {
            item,
        });
    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const response2 = await got(`${host}/science/article/pii/${item.id}`, {
                    cookieJar,
                });

                const $2 = load(response2.data);
                $2('.section-title').remove();
                item.doi = $2('.doi').attr('href').replace('https://doi.org/', '');
                item.abstract = $2('.abstract.author').text();
                item.description = renderDesc(item);
                return item;
            })
        )
    );

    return {
        title: `${jrnlName} - ${issue}`,
        link: issueUrl,
        item: items,
    };
}
